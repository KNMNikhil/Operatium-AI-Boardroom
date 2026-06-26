import time
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from arq import create_pool
from arq.connections import RedisSettings

from app.config import FRONTEND_URL, REDIS_URL
from app.api.routes import startups, meetings, knowledge
from app.logger import setup_logging, logger
from app.dependencies import limiter

# Initialize structured logging
setup_logging()

# Setup Rate Limiting is handled in app.dependencies

app = FastAPI(
    title="Operatium API",
    description="AI Executive Boardroom – Backend",
    version="2.0.0",
)

@app.on_event("startup")
async def startup_event():
    try:
        host = REDIS_URL.replace("redis://", "").split(":")[0]
        port = int(REDIS_URL.split(":")[-1]) if ":" in REDIS_URL.replace("redis://", "") else 6379
        app.state.redis_pool = await create_pool(RedisSettings(host=host, port=port))
        logger.info("arq_pool_created")
    except Exception as e:
        logger.error("arq_pool_failed", error=str(e))
        app.state.redis_pool = None

# Attach rate limiter to app
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ─── Middleware ───────────────────────────────────────────────────────────────

@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = time.time()
    response = await call_next(request)
    process_time = time.time() - start_time
    
    # Structured log for every request
    logger.info(
        "http_request",
        method=request.method,
        url=str(request.url.path),
        status_code=response.status_code,
        duration_ms=round(process_time * 1000, 2),
        client_ip=request.client.host
    )
    return response

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL, "http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Routes ───────────────────────────────────────────────────────────────────
app.include_router(startups.router)
app.include_router(meetings.router)
app.include_router(knowledge.router)


# ─── Health & Metrics ─────────────────────────────────────────────────────────
@app.get("/api/health")
@limiter.limit("60/minute")
async def health(request: Request):
    """Deep health check for production load balancers"""
    return {
        "status": "ok",
        "service": "Operatium API",
        "version": "2.0.0",
        "redis_connected": False
    }

@app.get("/api/metrics")
@limiter.limit("10/minute")
async def metrics(request: Request):
    """Expose metrics for Prometheus or Datadog"""
    return {
        "active_connections": "To be implemented with Redis PubSub",
        "uptime_seconds": time.time(), # Simplified for now
    }

@app.get("/")
async def root():
    return {"message": "Operatium AI Executive Boardroom API"}

