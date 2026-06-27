from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from app.db.models import StartupCreate, Startup
from app.db.supabase_client import get_supabase
from app.dependencies import limiter
from app.logger import logger
from app.cache import get_cached_or_fetch, invalidate_cache

router = APIRouter(prefix="/api/startups", tags=["startups"])


@router.post("", response_model=dict)
@limiter.limit("20/minute")
async def create_startup(request: Request, payload: StartupCreate):
    supabase = get_supabase()
    logger.info("create_startup_attempt", name=payload.name)
    try:
        result = supabase.table("startups").insert({
            "name": payload.name,
            "description": payload.description,
            "industry": payload.industry,
            "executives": payload.executives,
        }).execute()
        await invalidate_cache("startups:page:*")
        return result.data[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class ClassifyRequest(BaseModel):
    description: str

@router.post("/classify", response_model=dict)
@limiter.limit("20/minute")
async def classify_startup(request: Request, payload: ClassifyRequest):
    logger.info("classify_startup_attempt")
    try:
        from app.agents.executives.ceo import CEO
        from langchain_core.messages import HumanMessage
        
        ceo = CEO()
        prompt = f"""Analyze the following startup description and categorize its industry.
Description: {payload.description}

Provide the Primary Industry, Secondary Industry, and an optional Tertiary Industry from this exact list:
SaaS, Marketplace, Consumer App, FinTech, HealthTech, EdTech, AI / ML, E-commerce, Social Network, Developer Tools, Climate Tech, Enterprise Software, Gaming, Media & Entertainment, BioTech, Hardware, Robotics, SpaceTech, Web3 / Crypto, Cybersecurity, Logistics, PropTech, Other.

Return your answer ONLY as a JSON object with keys "primary", "secondary", and "tertiary" (can be empty string if not applicable). Do not output any markdown formatting like ```json."""
        
        resp = await ceo.llm.ainvoke([HumanMessage(content=prompt)])
        content = resp.content.strip()
        if content.startswith("```json"):
            content = content[7:]
        if content.endswith("```"):
            content = content[:-3]
        
        import json
        data = json.loads(content)
        return data
    except Exception as e:
        logger.error("industry_classification_failed", error=str(e))
        return {"primary": "Other", "secondary": "", "tertiary": ""}

@router.get("", response_model=list)
@limiter.limit("60/minute")
async def list_startups(request: Request, page: int = 1, limit: int = 50):
    supabase = get_supabase()
    offset = (page - 1) * limit
    logger.info("list_startups", page=page, limit=limit)
    try:
        async def fetch():
            result = supabase.table("startups").select("*").order("created_at", desc=True).range(offset, offset + limit - 1).execute()
            return result.data
        
        cache_key = f"startups:page:{page}:limit:{limit}"
        data = await get_cached_or_fetch(cache_key, fetch, ttl_seconds=60)
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{startup_id}", response_model=dict)
@limiter.limit("60/minute")
async def get_startup(request: Request, startup_id: str):
    supabase = get_supabase()
    logger.info("get_startup_details", startup_id=startup_id)
    try:
        async def fetch():
            startup = supabase.table("startups").select("*").eq("id", startup_id).single().execute()
            meetings = supabase.table("meetings").select("*").eq("startup_id", startup_id).order("created_at", desc=True).execute()
            decisions = supabase.table("decisions").select("*").eq("startup_id", startup_id).order("created_at", desc=True).limit(20).execute()
            reports = supabase.table("reports").select("id, report_type, created_at").eq("startup_id", startup_id).order("created_at", desc=True).execute()
            return {
                **startup.data,
                "meetings": meetings.data,
                "decisions": decisions.data,
                "reports": reports.data,
            }
        
        cache_key = f"startup:{startup_id}:details"
        data = await get_cached_or_fetch(cache_key, fetch, ttl_seconds=120)
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/{startup_id}/stage", response_model=dict)
@limiter.limit("30/minute")
async def update_stage(request: Request, startup_id: str, stage: str):
    supabase = get_supabase()
    logger.info("update_startup_stage", startup_id=startup_id, new_stage=stage)
    valid_stages = ["idea", "research", "validation", "mvp", "testing", "launch", "scaling"]
    if stage not in valid_stages:
        raise HTTPException(status_code=400, detail=f"Invalid stage. Must be one of: {valid_stages}")
    try:
        result = supabase.table("startups").update({"stage": stage}).eq("id", startup_id).execute()
        await invalidate_cache("startups:page:*")
        await invalidate_cache(f"startup:{startup_id}:details")
        return result.data[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{startup_id}", response_model=dict)
@limiter.limit("10/minute")
async def delete_startup(request: Request, startup_id: str):
    supabase = get_supabase()
    logger.warning("delete_startup_attempt", startup_id=startup_id)
    try:
        # Supabase foreign keys are usually set up to cascade, but we'll explicitly delete
        # the main startup. If relationships aren't cascaded, we'd need to delete children first.
        # Assuming cascade is ON for Operatium's schema.
        result = supabase.table("startups").delete().eq("id", startup_id).execute()
        await invalidate_cache("startups:page:*")
        await invalidate_cache(f"startup:{startup_id}:details")
        return {"status": "ok", "deleted": startup_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

