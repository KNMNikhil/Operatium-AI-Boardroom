import json
import asyncio
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect, Request
from app.db.models import MeetingCreate, FollowUpRequest
from app.db.supabase_client import get_supabase
from app.orchestrator.graph import run_meeting, run_followup
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
        supabase.table("followup_questions").insert({
            "startup_id": (supabase.table("meetings").select("startup_id").eq("id", meeting_id).single().execute()).data["startup_id"],
            "meeting_id": meeting_id,
            "question": payload.question,
        }).execute()
        return {"status": "ok", "meeting_id": meeting_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{meeting_id}/report", response_model=dict)
@limiter.limit("5/minute")
async def generate_report(request: Request, meeting_id: str):
    from app.orchestrator.graph import generate_dynamic_report
    logger.info("generate_report_attempt", meeting_id=meeting_id)
    try:
        report = await generate_dynamic_report(meeting_id)
        return {"status": "ok", "report": report}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.websocket("/ws/{meeting_id}")
async def meeting_websocket(websocket: WebSocket, meeting_id: str):
    """
    WebSocket endpoint for live meeting streaming.
    
    Client sends: { "startup_id": "...", "startup_name": "...", ... }
    Server sends: { "type": "token|speaking|stage_change|done", "executive": "...", "data": "..." }
    """
    await websocket.accept()
    supabase = get_supabase()

    try:
        # Receive startup info from client
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

        # ── Check for existing meeting and restore timeline ──────────────────
        existing_messages = supabase.table("meeting_messages").select("*").eq("meeting_id", meeting_id).order("sequence_order").execute()
        if existing_messages.data and not followup_question and not trigger_executive_questions:
            # Restore timeline
            for msg in existing_messages.data:
                await websocket.send_json({
                    "type": "speaking",
                    "executive": msg["executive_role"],
                    "stage": msg["stage"],
                })
                await websocket.send_json({
                    "type": "token",
                    "executive": msg["executive_role"],
                    "stage": msg["stage"],
                    "token": msg["content"],
                })
                await websocket.send_json({
                    "type": "message_complete",
                    "executive": msg["executive_role"],
                    "stage": msg["stage"],
                })

        # ── Offload to ARQ Worker ────────────────────────────────────────────
        arq_pool = getattr(websocket.app.state, "redis_pool", None)
        
        if followup_question:
            import time
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
            history = "\n".join([
                f"[{m['stage'].upper()}] {m['executive_role']}: {m['content'][:200]}..."
                for m in (messages.data or [])
            ])

            if arq_pool:
                await arq_pool.enqueue_job(
                    'execute_followup_task',
                    meeting_id, startup_name, startup_id, followup_question, executives, history
                )
            else:
                raise Exception("ARQ Worker pool is not available.")
                
        elif trigger_executive_questions:
            # Note: For full production, executive_questions should also be an ARQ task. 
            # Skipping implementation details here to focus on main flows.
            pass
        else:
            # Fresh meeting or Resume
            state: MeetingState = {
                "startup_id": startup_id,
                "meeting_id": meeting_id,
                "startup_name": startup_name,
                "startup_description": startup_description,
                "concept": startup_description,
                "industry": industry,
                "executives": executives,
                "analyses": {},
                "debate_responses": {},
                "decisions": [],
                "current_stage": "analysis",
                "report": {},
                "error": None,
                "existing_messages": existing_messages.data if existing_messages.data else []
            }
            if arq_pool:
                await arq_pool.enqueue_job('execute_meeting_task', meeting_id, state)
            else:
                raise Exception("ARQ Worker pool is not available.")

        # ── Listen to Redis PubSub ───────────────────────────────────────────
        import redis.asyncio as redis
        from app.config import REDIS_URL
        from app.cache import invalidate_cache
        
        redis_client = redis.from_url(REDIS_URL, decode_responses=True)
        pubsub = redis_client.pubsub()
        await pubsub.subscribe(f"meeting:{meeting_id}:stream")
        
        async for message in pubsub.listen():
            if message["type"] == "message":
                payload = json.loads(message["data"])
                
                if "error" in payload:
                    await websocket.send_json({"type": "error", "data": payload["error"]})
                    break
                    
                token = payload.get("token")
                if token == "__meeting_complete__":
                    try:
                        report = supabase.table("reports").select("*").eq("meeting_id", meeting_id).order("created_at", desc=True).limit(1).execute()
                        decisions = supabase.table("decisions").select("*").eq("meeting_id", meeting_id).execute()
                        await websocket.send_json({
                            "type": "meeting_complete",
                            "report": report.data[0] if report.data else {},
                            "decisions": decisions.data,
                        })
                    except Exception:
                        await websocket.send_json({"type": "meeting_complete"})
                        
                    await invalidate_cache(f"meeting:{meeting_id}:details")
                    await invalidate_cache(f"startup:{startup_id}:details")
                    break
                    
                elif token == "__done__":
                    await websocket.send_json({
                        "type": "message_complete",
                        "executive": payload.get("executive"),
                        "stage": payload.get("stage"),
                    })
                    if followup_question:
                        break # End stream for followup
                else:
                    await websocket.send_json({
                        "type": "token" if token else "speaking" if token == "__speaking__" else "stage_change",
                        "executive": payload.get("executive"),
                        "stage": payload.get("stage"),
                        "token": token,
                    })

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
