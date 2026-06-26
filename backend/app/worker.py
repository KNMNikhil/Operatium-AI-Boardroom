import json
import redis.asyncio as redis
from arq import Worker
from app.config import REDIS_URL
from app.logger import setup_logging, logger

# Initialize logging for worker process
setup_logging()

async def startup(ctx):
    logger.info("worker_started")
    ctx['redis'] = redis.from_url(REDIS_URL, decode_responses=True)

async def shutdown(ctx):
    logger.info("worker_shutting_down")
    await ctx['redis'].close()

async def execute_meeting_task(ctx, meeting_id: str, state: dict):
    from app.orchestrator.graph import run_meeting
    redis_client = ctx['redis']
    
    async def on_stream(stage: str, executive: str, token: str):
        payload = {"stage": stage, "executive": executive, "token": token}
        await redis_client.publish(f"meeting:{meeting_id}:stream", json.dumps(payload))
        
    try:
        await run_meeting(state=state, on_stream=on_stream)
        # Publish completion event
        await redis_client.publish(f"meeting:{meeting_id}:stream", json.dumps({"token": "__meeting_complete__"}))
    except Exception as e:
        logger.error("worker_meeting_failed", meeting_id=meeting_id, error=str(e), exc_info=True)
        await redis_client.publish(f"meeting:{meeting_id}:stream", json.dumps({"error": str(e)}))

async def execute_followup_task(ctx, meeting_id: str, startup_name: str, startup_id: str, question: str, executives: list, meeting_history: str):
    from app.orchestrator.graph import run_followup
    redis_client = ctx['redis']
    
    async def on_stream(stage: str, executive: str, token: str):
        payload = {"stage": stage, "executive": executive, "token": token}
        await redis_client.publish(f"meeting:{meeting_id}:stream", json.dumps(payload))
        
    try:
        await run_followup(
            startup_name=startup_name,
            startup_id=startup_id,
            meeting_id=meeting_id,
            question=question,
            executives=executives,
            meeting_history=meeting_history,
            on_stream=on_stream
        )
        await redis_client.publish(f"meeting:{meeting_id}:stream", json.dumps({"token": "__done__"}))
    except Exception as e:
        logger.error("worker_followup_failed", meeting_id=meeting_id, error=str(e), exc_info=True)
        await redis_client.publish(f"meeting:{meeting_id}:stream", json.dumps({"error": str(e)}))

class WorkerSettings:
    functions = [execute_meeting_task, execute_followup_task]
    on_startup = startup
    on_shutdown = shutdown
    redis_settings = None # Uses REDIS_URL by default if configured through ARQ natively, but we can rely on defaults.
    
# Use standard arq settings
from arq.connections import RedisSettings
try:
    # Basic parsing of redis url
    host = REDIS_URL.replace("redis://", "").split(":")[0]
    port = int(REDIS_URL.split(":")[-1]) if ":" in REDIS_URL.replace("redis://", "") else 6379
    WorkerSettings.redis_settings = RedisSettings(host=host, port=port)
except:
    pass
