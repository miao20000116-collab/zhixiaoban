"""FastAPI application entry point."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.career_intelligence import router as career_intelligence_router
from app.api.chat import router as chat_router
from app.api.conversations import router as conversations_router
from app.api.evaluation import router as evaluation_router
from app.api.health import router as health_router
from app.api.interview import router as interview_router
from app.api.job import router as job_router
from app.api.profile import router as profile_router
from app.api.resume import router as resume_router
from app.api.voice import router as voice_router
from app.config import settings
from app.services.dev_user import reset_current_user_hint, set_current_user_hint
from app.services.speech import audio_dir

app = FastAPI(
    title="AI Career Assistant API",
    description="Backend API for AI Career Assistant — Multi-Agent job search companion",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def request_user_context(request, call_next):
    token = set_current_user_hint(
        request.headers.get("x-user-email")
        or request.headers.get("x-test-user")
        or request.headers.get("authorization")
    )
    try:
        return await call_next(request)
    finally:
        reset_current_user_hint(token)

app.include_router(health_router, prefix="/api")
app.include_router(conversations_router)
app.include_router(chat_router)
app.include_router(profile_router)
app.include_router(job_router)
app.include_router(resume_router)
app.include_router(interview_router)
app.include_router(evaluation_router)
app.include_router(voice_router)
app.include_router(career_intelligence_router)

# Serve persisted interview / TTS audio (skip if filesystem is read-only)
try:
    _audio_path = audio_dir()
    app.mount("/media/audio", StaticFiles(directory=str(_audio_path)), name="media-audio")
except OSError:
    pass


@app.get("/")
async def root() -> dict[str, str]:
    return {"message": "AI Career Assistant API", "docs": "/docs"}
