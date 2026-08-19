"""Application configuration loaded from environment variables."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        # Local uvicorn cwd is usually backend/; Docker may use /app.
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str = "postgresql://postgres:postgres@localhost:5432/ai_career_assistant"
    vector_database_url: str = "postgresql://postgres:postgres@localhost:5432/ai_career_assistant"

    # Text LLM (e.g. DeepSeek)
    openai_api_key: str = ""
    openai_api_base: str = "https://api.openai.com/v1"
    model_name: str = "gpt-4o"
    embedding_model: str = "text-embedding-3-small"
    # DeepSeek V4 defaults thinking=on (slow). Keep off for Agent routing / chat latency.
    llm_thinking_enabled: bool = False

    # Speech ASR/TTS (e.g. SiliconFlow) — never reuse DeepSeek text base
    speech_api_key: str = ""
    speech_api_base: str = "https://api.siliconflow.cn/v1"
    whisper_model: str = "FunAudioLLM/SenseVoiceSmall"
    tts_model: str = "FunAudioLLM/CosyVoice2-0.5B"
    tts_voice: str = "FunAudioLLM/CosyVoice2-0.5B:anna"

    backend_host: str = "0.0.0.0"
    backend_port: int = 8000
    cors_origins: str = (
        "http://localhost:3000,http://localhost:3001,http://localhost:3003,"
        "http://127.0.0.1:3000,http://127.0.0.1:3001,http://127.0.0.1:3003"
    )
    memory_importance_threshold: int = 6
    audio_storage_dir: str = "data/audio"
    media_base_url: str = "http://localhost:8000/media"
    llm_request_timeout_seconds: float = 90.0
    agent_task_timeout_seconds: float = 150.0

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def resolved_speech_api_key(self) -> str:
        # Do not fall back to DeepSeek text key — it cannot do ASR/TTS.
        return (self.speech_api_key or "").strip()

    @property
    def resolved_speech_api_base(self) -> str:
        base = (self.speech_api_base or "").strip().rstrip("/")
        return base or "https://api.siliconflow.cn/v1"

    @property
    def speech_configured(self) -> bool:
        return bool(self.resolved_speech_api_key)


settings = Settings()
