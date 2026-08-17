"""Capture screenshots + PDF. Uses fixed waits (more reliable than loading-text polls)."""

from __future__ import annotations

import json
import time
import urllib.request
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / "docs" / "screenshots"
PDF_PATH = ROOT / "docs" / "职小伴-作品集截图.pdf"
BASE = "http://localhost:3000"
API = "http://localhost:8000"
PAGES: list[tuple[str, str]] = []


def register_font() -> str:
    for path in (
        Path(r"C:\Windows\Fonts\msyh.ttc"),
        Path(r"C:\Windows\Fonts\simhei.ttf"),
    ):
        if path.exists():
            try:
                pdfmetrics.registerFont(TTFont("CN", str(path), subfontIndex=0))
            except Exception:
                pdfmetrics.registerFont(TTFont("CN", str(path)))
            return "CN"
    return "Helvetica"


def api_json(path: str):
    with urllib.request.urlopen(f"{API}{path}", timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def shot(page, name: str, title: str) -> None:
    path = OUT_DIR / f"{name}.png"
    page.screenshot(path=str(path), full_page=False)
    PAGES.append((title, str(path)))
    print(f"SHOT {name} size={path.stat().st_size} — {title}", flush=True)


def settle(page, ms: int = 2000) -> None:
    try:
        page.wait_for_load_state("networkidle", timeout=15000)
    except Exception:
        pass
    page.wait_for_timeout(ms)


def click_text(page, text: str) -> bool:
    for loc in (
        page.locator("aside").get_by_text(text, exact=False),
        page.get_by_role("button", name=text),
        page.get_by_text(text, exact=False),
    ):
        try:
            if loc.count() == 0:
                continue
            loc.first.click(timeout=4000)
            return True
        except Exception:
            continue
    return False


def capture() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for old in OUT_DIR.glob("*.png"):
        old.unlink()

    # Warm backend endpoints used by pages
    for path in ("/conversation", "/profile", "/evaluation/prompts?full=true", "/evaluation/dashboard?days=30"):
        try:
            api_json(path)
            print("warm", path, flush=True)
        except Exception as exc:
            print("warm fail", path, exc, flush=True)

    conversations = api_json("/conversation")
    if not isinstance(conversations, list):
        conversations = []
    print(f"conversations={len(conversations)}", flush=True)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={"width": 1500, "height": 960},
            device_scale_factor=1.25,
            locale="zh-CN",
        )
        page = context.new_page()

        print("open home", flush=True)
        page.goto(BASE, wait_until="domcontentloaded", timeout=60000)
        settle(page, 3500)

        if page.get_by_role("button", name="开始对话").count() > 0:
            try:
                page.get_by_role("button", name="开始对话").first.click(timeout=3000)
                settle(page, 2500)
            except Exception:
                pass

        if conversations:
            click_text(page, conversations[0].get("title") or "简历")
            settle(page, 3000)
        shot(page, "01-home-chat", "主对话页 · 会话总览")

        for i, conv in enumerate(conversations[:4], start=1):
            title = conv.get("title") or f"对话{i}"
            ok = click_text(page, title)
            print(f"select {i} {title} ok={ok}", flush=True)
            settle(page, 3000)
            try:
                page.mouse.wheel(0, 500)
                page.wait_for_timeout(400)
            except Exception:
                pass
            shot(page, f"0{i + 1}-conversation-{i}", f"对话 {i} · {title}")

        print("open profile", flush=True)
        page.goto(f"{BASE}/profile", wait_until="domcontentloaded", timeout=60000)
        settle(page, 4500)
        shot(page, "08-profile-top", "完整档案页 · 顶部")
        page.evaluate("window.scrollTo(0, 700)")
        page.wait_for_timeout(700)
        shot(page, "09-profile-mid", "完整档案页 · 中部")
        page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        page.wait_for_timeout(700)
        shot(page, "10-profile-bottom", "完整档案页 · 底部")

        print("open dashboard", flush=True)
        page.goto(f"{BASE}/dashboard", wait_until="domcontentloaded", timeout=60000)
        settle(page, 4000)
        body = page.inner_text("body")
        if "暂无版本" in body:
            if click_text(page, "同步文件提示词"):
                settle(page, 3000)
        if click_text(page, "查看全文"):
            page.wait_for_timeout(800)
        shot(page, "11-dashboard-top", "质量看板 · 顶部指标")
        page.evaluate("window.scrollTo(0, 900)")
        page.wait_for_timeout(800)
        shot(page, "12-dashboard-prompts", "质量看板 · 提示词内容区")

        print("chat with panel", flush=True)
        page.goto(BASE, wait_until="domcontentloaded", timeout=60000)
        settle(page, 3000)
        if conversations:
            click_text(page, conversations[0].get("title") or "简历")
            settle(page, 2500)
        click_text(page, "画像")
        settle(page, 1500)
        shot(page, "13-chat-profile-panel", "主对话页 · 个人画像侧栏")

        for theme in ("夏", "秋", "冬"):
            click_text(page, theme)
            page.wait_for_timeout(400)
        shot(page, "14-theme", "主对话页 · 四季主题")

        browser.close()
        print("browser closed", flush=True)


def build_pdf() -> None:
    font = register_font()
    c = canvas.Canvas(str(PDF_PATH), pagesize=A4)
    width, height = A4

    c.setFont(font, 22)
    c.drawString(25 * mm, height - 40 * mm, "职小伴 · AI 求职助手")
    c.setFont(font, 14)
    c.drawString(25 * mm, height - 52 * mm, "作品集界面截图汇总")
    c.setFont(font, 11)
    c.drawString(25 * mm, height - 68 * mm, time.strftime("生成时间：%Y-%m-%d %H:%M"))
    c.drawString(25 * mm, height - 78 * mm, "覆盖：多段对话、完整档案、质量看板（提示词）、主题与画像")
    c.drawString(25 * mm, height - 88 * mm, f"截图数量：{len(PAGES)}")
    c.showPage()

    for title, img_path in PAGES:
        c.setFont(font, 12)
        c.drawString(15 * mm, height - 18 * mm, title)
        img = Image.open(img_path)
        max_w = width - 30 * mm
        max_h = height - 35 * mm
        iw, ih = img.size
        scale = min(max_w / iw, max_h / ih)
        draw_w, draw_h = iw * scale, ih * scale
        x = (width - draw_w) / 2
        y = height - 22 * mm - draw_h
        c.drawImage(ImageReader(img), x, y, width=draw_w, height=draw_h, preserveAspectRatio=True, mask="auto")
        c.setFont(font, 8)
        c.drawRightString(width - 15 * mm, 10 * mm, Path(img_path).name)
        c.showPage()

    c.save()
    print(f"PDF -> {PDF_PATH} ({PDF_PATH.stat().st_size} bytes)", flush=True)


if __name__ == "__main__":
    capture()
    build_pdf()
    print("DONE", flush=True)
