"""Tool pages AI proxy — reuse 职小伴 server-side API keys from .env."""

from __future__ import annotations

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.config import settings

router = APIRouter(prefix="/api/tools", tags=["tools-ai"])  # chat / search / ai-config

MODEL_CATALOG = [
    {
        "id": "deepseek-v4-flash",
        "name": "DeepSeek V4 Flash（简历优化推荐）",
        "desc": "简历优化专用，效果优秀",
        "serverProvider": "deepseek",
    },
    {
        "id": "zhipu-glm4-flash",
        "name": "智谱 GLM-4-Flash（免费）",
        "desc": "日常优先，速度快",
        "serverProvider": None,
    },
    {
        "id": "siliconflow-deepseek",
        "name": "硅基流动 DeepSeek-R1",
        "desc": "复杂推理，深度分析",
        "serverProvider": "siliconflow",
    },
    {
        "id": "doubao",
        "name": "火山引擎豆包 Lite（速度快）",
        "desc": "推荐优先使用，速度快",
        "serverProvider": None,
    },
]

TASK_LABELS = {
    "resume": "简历优化",
    "jd": "JD解析",
    "predict": "面试押题",
    "script": "逐字稿生成",
    "research": "行业调研",
    "score": "答题打分",
    "transcribe": "语音转写",
    "builder": "经历采集",
}

DEFAULT_TASK_MODELS = {
    "resume": "deepseek-v4-flash",
    "jd": "deepseek-v4-flash",
    "predict": "deepseek-v4-flash",
    "script": "zhipu-glm4-flash",
    "research": "deepseek-v4-flash",
    "score": "siliconflow-deepseek",
    "transcribe": "siliconflow-deepseek",
    "builder": "deepseek-v4-flash",
}


class ToolsChatRequest(BaseModel):
    model: str = "deepseek-v4-flash"
    messages: list[dict[str, str]]
    temperature: float = 0.7
    max_tokens: int = Field(default=4096, ge=256, le=32768)


class ToolsChatResponse(BaseModel):
    content: str
    provider: str
    source: str


def _mask_key(key: str) -> str:
    key = (key or "").strip()
    if len(key) <= 8:
        return "已配置" if key else ""
    return f"{key[:4]}…{key[-4:]}"


def _provider_status() -> dict[str, dict[str, str | bool]]:
    return {
        "deepseek": {
            "configured": bool(settings.openai_api_key.strip()),
            "source": "server",
            "label": "DeepSeek（职小伴 OPENAI_API_KEY）",
            "masked": _mask_key(settings.openai_api_key),
            "base": settings.openai_api_base,
            "model": settings.model_name,
        },
        "siliconflow": {
            "configured": bool(settings.resolved_speech_api_key),
            "source": "server",
            "label": "硅基流动（职小伴 SPEECH_API_KEY）",
            "masked": _mask_key(settings.resolved_speech_api_key),
            "base": settings.resolved_speech_api_base,
            "model": "deepseek-ai/DeepSeek-R1-Distill-Qwen-7B",
        },
        "zhipu": {"configured": False, "source": "browser", "label": "智谱 GLM", "masked": ""},
        "doubao": {"configured": False, "source": "browser", "label": "火山引擎豆包", "masked": ""},
    }


def _resolve_deepseek_api_model() -> str:
    name = (settings.model_name or "deepseek-chat").strip()
    if name in {"deepseek-v4-flash", "deepseek-v4"}:
        return "deepseek-chat"
    return name or "deepseek-chat"


def _resolve_server_call(model_key: str) -> tuple[str, str, str, str] | None:
    if model_key == "deepseek-v4-flash":
        if not settings.openai_api_key.strip():
            return None
        url = f"{settings.openai_api_base.rstrip('/')}/chat/completions"
        api_model = _resolve_deepseek_api_model()
        return url, settings.openai_api_key, api_model, "DeepSeek（职小伴服务端）"

    if model_key == "siliconflow-deepseek":
        if not settings.resolved_speech_api_key:
            return None
        base = settings.resolved_speech_api_base.rstrip("/")
        url = f"{base}/chat/completions"
        return (
            url,
            settings.resolved_speech_api_key,
            "deepseek-ai/DeepSeek-R1-Distill-Qwen-7B",
            "硅基流动（职小伴服务端）",
        )

    return None


async def _complete_via_server(model_key: str, body: ToolsChatRequest) -> ToolsChatResponse:
    resolved = _resolve_server_call(model_key)
    if not resolved:
        raise HTTPException(status_code=501, detail=f"模型 {model_key} 未在服务端配置，请在浏览器设置中填写 API Key")

    url, api_key, api_model, provider_name = resolved
    payload = {
        "model": api_model,
        "messages": body.messages,
        "temperature": body.temperature,
        "max_tokens": body.max_tokens,
        "stream": False,
    }

    if "deepseek" in url.lower() or api_model.lower().startswith("deepseek"):
        payload["thinking"] = {"type": "disabled"}

    timeout = httpx.Timeout(connect=15.0, read=settings.llm_request_timeout_seconds, write=30.0, pool=10.0)
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                url,
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json=payload,
            )
    except httpx.TimeoutException as exc:
        raise HTTPException(status_code=504, detail=f"{provider_name} 请求超时，请稍后重试") from exc
    except httpx.ConnectError as exc:
        raise HTTPException(status_code=502, detail=f"{provider_name} 网络连接失败，请检查网络或稍后重试") from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"{provider_name} 调用异常：{exc}") from exc

    if response.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"{provider_name} 返回错误 ({response.status_code}): {response.text[:500]}")
    data = response.json()

    content = data.get("choices", [{}])[0].get("message", {}).get("content") or ""
    return ToolsChatResponse(content=content, provider=provider_name, source="server")


class ToolsSearchRequest(BaseModel):
    company: str = ""
    industry: str = ""


class ToolsSearchResponse(BaseModel):
    context: str
    source_count: int


@router.post("/search", response_model=ToolsSearchResponse)
async def tools_search(body: ToolsSearchRequest) -> ToolsSearchResponse:
    from app.services.tools.search import format_search_context, search_company_and_industry

    company = body.company.strip()
    industry = body.industry.strip()
    if not company and not industry:
        raise HTTPException(status_code=400, detail="请提供公司名或行业名")

    search_data = await search_company_and_industry(
        company=company or None,
        position=None,
        industry=industry or None,
    )
    company_results = search_data.get("company_results") or []
    industry_results = search_data.get("industry_results") or []
    source_count = len(company_results) + len(industry_results)
    return ToolsSearchResponse(context=format_search_context(search_data), source_count=source_count)


@router.get("/ai-config")
async def get_tools_ai_config() -> dict:
    providers = _provider_status()
    return {
        "models": MODEL_CATALOG,
        "providers": providers,
        "defaultModel": "deepseek-v4-flash" if providers["deepseek"]["configured"] else "zhipu-glm4-flash",
        "taskLabels": TASK_LABELS,
        "defaultTaskModels": DEFAULT_TASK_MODELS,
        "storageKey": "ai_api_keys",
        "serverKeysEnabled": bool(providers["deepseek"]["configured"] or providers["siliconflow"]["configured"]),
    }


@router.post("/chat", response_model=ToolsChatResponse)
async def tools_chat(body: ToolsChatRequest) -> ToolsChatResponse:
    return await _complete_via_server(body.model, body)
