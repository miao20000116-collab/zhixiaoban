"""Web search tool for company and industry research.

Uses DuckDuckGo Instant Answer API — no fixed knowledge base.
Industry/company info changes quickly; always prefer live search.
"""

from datetime import datetime, timezone

import httpx


async def search_web(query: str, *, max_results: int = 5) -> list[dict[str, str]]:
    """Return a list of {title, snippet, url} from DuckDuckGo."""
    results: list[dict[str, str]] = []
    try:
        async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
            response = await client.get(
                "https://api.duckduckgo.com/",
                params={
                    "q": query,
                    "format": "json",
                    "no_html": 1,
                    "skip_disambig": 1,
                },
            )
            response.raise_for_status()
            data = response.json()

            abstract = data.get("AbstractText") or ""
            abstract_url = data.get("AbstractURL") or ""
            heading = data.get("Heading") or query
            if abstract:
                results.append(
                    {
                        "title": heading,
                        "snippet": abstract,
                        "url": abstract_url,
                    }
                )

            for topic in data.get("RelatedTopics", [])[:max_results]:
                if isinstance(topic, dict) and "Text" in topic:
                    results.append(
                        {
                            "title": topic.get("Text", "")[:80],
                            "snippet": topic.get("Text", ""),
                            "url": topic.get("FirstURL", ""),
                        }
                    )
                elif isinstance(topic, dict) and "Topics" in topic:
                    for sub in topic["Topics"][:2]:
                        if "Text" in sub:
                            results.append(
                                {
                                    "title": sub.get("Text", "")[:80],
                                    "snippet": sub.get("Text", ""),
                                    "url": sub.get("FirstURL", ""),
                                }
                            )
                if len(results) >= max_results:
                    break
    except Exception:
        return []

    return results[:max_results]


async def search_company_and_industry(
    company: str | None,
    position: str | None,
    industry: str | None = None,
) -> dict[str, object]:
    """Search company and industry context for Job Agent."""
    as_of = datetime.now(timezone.utc).strftime("%Y-%m")
    company_results: list[dict[str, str]] = []
    industry_results: list[dict[str, str]] = []

    if company:
        company_results = await search_web(f"{company} 公司 业务 简介")
        if not company_results:
            company_results = await search_web(f"{company} company overview")

    industry_query = industry or (f"{position} 行业趋势" if position else None)
    if industry_query:
        industry_results = await search_web(industry_query)
        if position and not industry:
            extra = await search_web(f"{position} 招聘趋势 2026")
            industry_results = (industry_results + extra)[:5]

    return {
        "as_of": as_of,
        "company_results": company_results,
        "industry_results": industry_results,
    }


def format_search_context(search_data: dict[str, object]) -> str:
    as_of = search_data.get("as_of", "")
    lines = [f"搜索时间：{as_of}"]

    company_results = search_data.get("company_results") or []
    if isinstance(company_results, list) and company_results:
        lines.append("\n## 公司搜索结果")
        for item in company_results:
            if isinstance(item, dict):
                lines.append(f"- {item.get('title', '')}: {item.get('snippet', '')}")
                if item.get("url"):
                    lines.append(f"  来源: {item['url']}")
    else:
        lines.append("\n## 公司搜索结果\n（暂无可靠结果）")

    industry_results = search_data.get("industry_results") or []
    if isinstance(industry_results, list) and industry_results:
        lines.append("\n## 行业搜索结果")
        for item in industry_results:
            if isinstance(item, dict):
                lines.append(f"- {item.get('title', '')}: {item.get('snippet', '')}")
                if item.get("url"):
                    lines.append(f"  来源: {item['url']}")
    else:
        lines.append("\n## 行业搜索结果\n（暂无可靠结果）")

    return "\n".join(lines)
