import json
import asyncio
import time
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect, Request
from app.db.models import MeetingCreate, FollowUpRequest
from app.db.supabase_client import get_supabase
from app.orchestrator.graph import run_meeting, run_followup, generate_dynamic_report
from app.orchestrator.state import MeetingState
from app.dependencies import limiter
from app.logger import logger
from app.cache import get_cached_or_fetch, invalidate_cache

router = APIRouter(prefix="/api/meetings", tags=["meetings"])


@router.post("", response_model=dict)
@limiter.limit("10/minute")
async def create_meeting(request: Request, payload: MeetingCreate):
    """Create a meeting record and return its ID. The actual run happens over WebSocket."""
    supabase = get_supabase()
    logger.info("create_meeting_attempt", startup_id=payload.startup_id, meeting_type=payload.meeting_type)
    try:
        # Verify startup exists
        startup = supabase.table("startups").select("*").eq("id", payload.startup_id).single().execute()
        if not startup.data:
            raise HTTPException(status_code=404, detail="Startup not found")

        # Create meeting
        result = supabase.table("meetings").insert({
            "startup_id": payload.startup_id,
            "meeting_type": payload.meeting_type,
            "executives": payload.executives,
            "status": "pending",
        }).execute()

        meeting = result.data[0]

        # Increment startup meeting count
        supabase.table("startups").update({
            "meeting_count": startup.data.get("meeting_count", 0) + 1
        }).eq("id", payload.startup_id).execute()

        await invalidate_cache(f"startup:{payload.startup_id}:details")

        return meeting
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{meeting_id}", response_model=dict)
@limiter.limit("60/minute")
async def get_meeting(request: Request, meeting_id: str):
    supabase = get_supabase()
    logger.info("get_meeting_details", meeting_id=meeting_id)
    try:
        async def fetch():
            meeting = supabase.table("meetings").select("*").eq("id", meeting_id).single().execute()
            messages = supabase.table("meeting_messages").select("*").eq("meeting_id", meeting_id).order("sequence_order").execute()
            decisions = supabase.table("decisions").select("*").eq("meeting_id", meeting_id).execute()
            return {
                **meeting.data,
                "messages": messages.data,
                "decisions": decisions.data,
            }
        
        cache_key = f"meeting:{meeting_id}:details"
        return await get_cached_or_fetch(cache_key, fetch, ttl_seconds=60)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{meeting_id}/followup", response_model=dict)
@limiter.limit("20/minute")
async def create_followup(request: Request, meeting_id: str, payload: FollowUpRequest):
    supabase = get_supabase()
    logger.info("create_followup_question", meeting_id=meeting_id)
    try:
        startup_id = (supabase.table("meetings").select("startup_id").eq("id", meeting_id).single().execute()).data["startup_id"]
        supabase.table("followup_questions").insert({
            "startup_id": startup_id,
            "meeting_id": meeting_id,
            "question": payload.question,
        }).execute()
        return {"status": "ok", "meeting_id": meeting_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{meeting_id}/report", response_model=dict)
@limiter.limit("5/minute")
async def generate_report(request: Request, meeting_id: str):
    logger.info("generate_report_attempt", meeting_id=meeting_id)
    try:
        report = await generate_dynamic_report(meeting_id)
        return {"status": "ok", "report": report}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{meeting_id}/pivot", response_model=dict)
@limiter.limit("5/minute")
async def pivot_meeting(request: Request, meeting_id: str):
    supabase = get_supabase()
    logger.info("pivot_meeting_attempt", meeting_id=meeting_id)
    try:
        meeting = supabase.table("meetings").select("startup_id").eq("id", meeting_id).single().execute()
        startup_id = meeting.data["startup_id"]
        startup = supabase.table("startups").select("*").eq("id", startup_id).single().execute().data
        
        prompt = f"""We need to PIVOT this startup idea because it scored poorly in the boardroom.
Startup Name: {startup['name']}
Industry: {startup['industry']}
Original Description: {startup['description']}

The board found major flaws in this idea. You must mutate this idea into a highly profitable, realistic adjacent market. 
Change the core offering to solve the root problem but in a vastly better way.
Respond ONLY with a JSON object containing the new name and new description.
Format: {{"name": "New Name", "description": "New highly detailed description."}}"""

        from app.agents import get_executive
        ceo = get_executive("CEO")
        from langchain_core.messages import HumanMessage
        resp = await ceo.llm.ainvoke([HumanMessage(content=prompt)])
        content = resp.content
        
        import json
        import re
        match = re.search(r'\{.*\}', content, re.DOTALL)
        if match:
            try:
                data = json.loads(match.group(0))
            except:
                data = {"name": startup["name"] + " (Pivoted)", "description": "Pivoted idea: " + content[:200]}
        else:
            data = {"name": startup["name"] + " (Pivoted)", "description": "Pivoted idea..."}
            
        new_startup = supabase.table("startups").insert({
            "name": data["name"],
            "description": data["description"],
            "industry": startup["industry"],
            "executives": startup["executives"],
        }).execute().data[0]
        
        return {
            "status": "ok", 
            "startup_id": new_startup["id"], 
            "name": new_startup["name"], 
            "description": new_startup["description"]
        }
    except Exception as e:
        logger.error("pivot_failed", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.websocket("/ws/{meeting_id}")
async def meeting_websocket(websocket: WebSocket, meeting_id: str):
    """
    WebSocket endpoint for live meeting streaming without ARQ/Redis.
    """
    await websocket.accept()
    supabase = get_supabase()

    try:
        init_data = await websocket.receive_json()

        startup_id = init_data.get("startup_id")
        startup_name = init_data.get("startup_name", "")
        startup_description = init_data.get("startup_description", "")
        industry = init_data.get("industry", "")
        executives = init_data.get("executives", [])
        followup_question = init_data.get("followup_question")
        trigger_executive_questions = init_data.get("trigger_executive_questions", False)

        if not startup_id or not executives:
            await websocket.send_json({"type": "error", "data": "Missing startup_id or executives"})
            await websocket.close()
            return

        # Restore timeline
        existing_messages = supabase.table("meeting_messages").select("*").eq("meeting_id", meeting_id).order("sequence_order").execute()
        if existing_messages.data and not followup_question and not trigger_executive_questions:
            for msg in existing_messages.data:
                await websocket.send_json({"type": "speaking", "executive": msg["executive_role"], "stage": msg["stage"]})
                await websocket.send_json({"type": "token", "executive": msg["executive_role"], "stage": msg["stage"], "token": msg["content"]})
                await websocket.send_json({"type": "message_complete", "executive": msg["executive_role"], "stage": msg["stage"]})

        async def on_stream(stage: str, executive: str, token: str):
            if token == "__done__":
                await websocket.send_json({"type": "message_complete", "executive": executive, "stage": stage})
            elif token == "__speaking__":
                await websocket.send_json({"type": "speaking", "executive": executive, "stage": stage})
            elif token == "__stage_change__":
                await websocket.send_json({"type": "stage_change", "executive": executive, "stage": stage})
            else:
                await websocket.send_json({"type": "token", "executive": executive, "stage": stage, "token": token})

        if followup_question:
            try:
                supabase.table("meeting_messages").insert({
                    "meeting_id": meeting_id,
                    "executive_role": "Founder",
                    "content": followup_question,
                    "message_type": "question",
                    "stage": "followup",
                    "sequence_order": int(time.time() * 1000),
                }).execute()
            except Exception as e:
                logger.error("ws_db_save_founder_question_failed", error=str(e))

            messages = supabase.table("meeting_messages").select("executive_role, content, stage").eq("meeting_id", meeting_id).order("sequence_order").limit(20).execute()
            history = "\n".join([f"[{m['stage'].upper()}] {m['executive_role']}: {m['content'][:200]}..." for m in (messages.data or [])])
            
            # Execute Followup
            meeting_data = supabase.table("meetings").select("meeting_type").eq("id", meeting_id).single().execute()
            meeting_type = meeting_data.data.get("meeting_type", "full_board") if meeting_data.data else "full_board"

            await run_followup(
                startup_name=startup_name,
                startup_id=startup_id,
                meeting_id=meeting_id,
                question=followup_question,
                executives=executives,
                meeting_history=history,
                on_stream=on_stream,
                meeting_type=meeting_type
            )
            # Signal Done
            await websocket.send_json({"type": "message_complete", "executive": "Followup Done", "stage": "followup"})

        elif trigger_executive_questions:
            pass
        else:
            meeting_data = supabase.table("meetings").select("meeting_type").eq("id", meeting_id).single().execute()
            meeting_type = meeting_data.data.get("meeting_type", "full_board") if meeting_data.data else "full_board"

            state: MeetingState = {
                "startup_id": startup_id,
                "meeting_id": meeting_id,
                "startup_name": startup_name,
                "startup_description": startup_description,
                "concept": startup_description,
                "industry": industry,
                "executives": executives,
                "meeting_type": meeting_type,
                "analyses": {},
                "debate_responses": {},
                "decisions": [],
                "current_stage": "analysis",
                "report": {},
                "error": None,
                "existing_messages": existing_messages.data if existing_messages.data else []
            }
            
            # Run the meeting synchronously on the async loop, feeding tokens to the socket
            await run_meeting(state, on_stream)
            
            # Generate Report in the background so we don't block the UI
            asyncio.create_task(generate_dynamic_report(meeting_id))

            # Send Completion Payload instantly
            try:
                decisions = supabase.table("decisions").select("*").eq("meeting_id", meeting_id).execute()
                await websocket.send_json({
                    "type": "meeting_complete",
                    "report": {},
                    "decisions": decisions.data,
                })
            except Exception:
                await websocket.send_json({"type": "meeting_complete"})
            
            await invalidate_cache(f"meeting:{meeting_id}:details")
            await invalidate_cache(f"startup:{startup_id}:details")

    except WebSocketDisconnect:
        logger.info("ws_client_disconnected", meeting_id=meeting_id)
    except Exception as e:
        try:
            await websocket.send_json({"type": "error", "data": str(e)})
        except Exception:
            pass
        logger.error("ws_error", meeting_id=meeting_id, error=str(e), exc_info=True)
    finally:
        try:
            await websocket.close()
        except Exception:
            pass
