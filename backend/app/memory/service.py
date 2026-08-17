"""Career memory read/write service."""

import re
import uuid
from datetime import datetime

from sqlalchemy.orm import Session

from app.agents.memory.schema import MemoryExtraction
from app.config import settings
from app.models.career_profile import CareerProfile
from app.models.experience import Experience
from app.models.project import Project
from app.models.skill import Skill
from app.models.user import User
from app.services.dev_user import get_or_create_dev_user


def get_or_create_profile(db: Session, user_id: uuid.UUID) -> CareerProfile:
    profile = db.query(CareerProfile).filter(CareerProfile.user_id == user_id).first()
    if profile is None:
        profile = CareerProfile(user_id=user_id)
        db.add(profile)
        db.commit()
        db.refresh(profile)
    return profile


def build_constraint_memory_context(db: Session, user_id: uuid.UUID) -> str:
    """Constraints + short goal only — for Resume optimize/star to avoid memory bleed."""
    profile = db.query(CareerProfile).filter(CareerProfile.user_id == user_id).first()
    if profile is None:
        return ""

    lines: list[str] = []
    if profile.target_position:
        lines.append(f"目标岗位：{profile.target_position}")
    if profile.target_industry:
        lines.append(f"目标行业：{profile.target_industry}")

    constraints: list[str] = []
    if profile.career_summary:
        for raw_line in str(profile.career_summary).splitlines():
            stripped = raw_line.strip()
            if stripped.startswith("【约束】"):
                constraints.append(stripped)
            elif any(
                k in stripped
                for k in ("没有真实", "只上过", "只是上过", "不要虚构", "不希望虚构", "禁止虚构")
            ):
                constraints.append(stripped if stripped.startswith("【约束】") else f"【约束】{stripped}")
    if constraints:
        lines.append("## 约束记忆（一票否决）")
        lines.extend(dict.fromkeys(constraints))  # preserve order, dedupe
    elif not lines:
        return ""
    return "\n".join(lines)


def build_memory_context(db: Session, user_id: uuid.UUID) -> str:
    profile = db.query(CareerProfile).filter(CareerProfile.user_id == user_id).first()
    experiences = db.query(Experience).filter(Experience.user_id == user_id).all()
    projects = db.query(Project).filter(Project.user_id == user_id).all()
    skills = db.query(Skill).filter(Skill.user_id == user_id).all()

    if not profile and not experiences and not projects and not skills:
        return ""

    lines: list[str] = []

    if profile:
        if profile.target_position:
            lines.append(f"目标岗位：{profile.target_position}")
        if profile.target_industry:
            lines.append(f"目标行业：{profile.target_industry}")
        if profile.experience_year:
            lines.append(f"工作年限：{profile.experience_year}年")
        if profile.career_summary:
            lines.append(f"职业摘要：{profile.career_summary}")
            # Surface constraint lines clearly for Resume / Interview Agents
            for raw_line in str(profile.career_summary).splitlines():
                if raw_line.strip().startswith("【约束】"):
                    lines.append(raw_line.strip())

    if experiences:
        lines.append("\n## 工作经历")
        for exp in experiences:
            parts = [p for p in [exp.position, exp.company, exp.responsibility] if p]
            attr = _attr_suffix(exp.source, exp.confidence)
            lines.append("- " + " | ".join(parts) + attr)

    if projects:
        lines.append("\n## 项目经历")
        for proj in projects:
            parts = [p for p in [proj.project_name, proj.background, proj.action, proj.result] if p]
            attr = _attr_suffix(getattr(proj, "source", None), proj.confidence)
            lines.append("- " + " | ".join(parts) + attr)

    if skills:
        lines.append("\n## 技能")
        for sk in skills:
            level_str = f" ({sk.level}/10)" if sk.level else ""
            attr = _attr_suffix(sk.source, sk.confidence)
            lines.append(f"- {sk.skill_name}{level_str}{attr}")

    return "\n".join(lines)


def _attr_suffix(source: str | None, confidence: float | None) -> str:
    bits: list[str] = []
    if source:
        label = {"conversation": "对话记忆", "resume": "简历", "manual": "手动编辑"}.get(source, source)
        bits.append(f"来源:{label}")
    if confidence is not None:
        bits.append(f"置信度:{confidence:.0%}" if confidence <= 1 else f"置信度:{confidence}")
    return f" （{' · '.join(bits)}）" if bits else ""


def apply_extractions(
    db: Session,
    user_id: uuid.UUID,
    extractions: list[MemoryExtraction],
) -> int:
    """Persist extractions above importance threshold. Returns count saved."""
    threshold = settings.memory_importance_threshold
    saved = 0

    for item in extractions:
        if item.importance_score < threshold:
            continue
        if _apply_single(db, user_id, item):
            saved += 1

    if saved > 0:
        _refresh_profile_summary(db, user_id)

    return saved


def _apply_single(db: Session, user_id: uuid.UUID, item: MemoryExtraction) -> bool:
    data = item.data
    source = "conversation"
    confidence = item.importance_score / 10.0

    if item.type in ("profile", "fact_memory"):
        profile = get_or_create_profile(db, user_id)
        if data.get("target_position"):
            profile.target_position = str(data["target_position"])
        if data.get("industry"):
            profile.target_industry = str(data["industry"])
        if data.get("experience_year") is not None:
            profile.experience_year = int(data["experience_year"])
        if data.get("summary") or data.get("fact"):
            profile.career_summary = _merge_summary_preserving_constraints(
                profile.career_summary,
                str(data.get("summary") or data.get("fact")),
            )
        profile.confidence_score = max(profile.confidence_score or 0, confidence)
        profile.updated_at = datetime.utcnow()
        db.commit()
        return True

    if item.type in ("career_goal", "goal_memory"):
        profile = get_or_create_profile(db, user_id)
        if data.get("target_position"):
            profile.target_position = str(data["target_position"])
        if data.get("industry"):
            profile.target_industry = str(data["industry"])
        profile.confidence_score = max(profile.confidence_score or 0, confidence)
        profile.updated_at = datetime.utcnow()
        db.commit()
        return True

    if item.type == "experience":
        if not _has_meaningful(data, ["company", "position", "responsibility", "achievement"]):
            return False
        if _is_duplicate_experience(db, user_id, data):
            return False
        exp = Experience(
            user_id=user_id,
            company=data.get("company"),
            position=data.get("position"),
            responsibility=data.get("responsibility"),
            achievement=data.get("achievement"),
            source=source,
            confidence=confidence,
        )
        db.add(exp)
        db.commit()
        return True

    if item.type == "constraint_memory":
        constraint = data.get("constraint") or data.get("fact") or data.get("note")
        if not constraint:
            return False
        profile = get_or_create_profile(db, user_id)
        marker = f"【约束】{str(constraint).strip()}"
        summary = (profile.career_summary or "").strip()
        if marker not in summary:
            profile.career_summary = f"{summary}\n{marker}".strip() if summary else marker
        # Also reflect as gap/weakness so Recommendation / Resume see it
        from app.services.career_status_service import get_or_create_career_status

        status = get_or_create_career_status(db, user_id)
        focuses = list(status.focus_areas or [])
        topic = str(data.get("topic") or constraint)[:80]
        if topic not in focuses:
            focuses.insert(0, f"限制：{topic}")
        status.focus_areas = focuses[:6]
        status.weakness = (status.weakness or "")
        if str(constraint) not in (status.weakness or ""):
            status.weakness = (
                f"{status.weakness}；{constraint}".strip("；") if status.weakness else str(constraint)
            )
        status.updated_at = datetime.utcnow()
        profile.confidence_score = max(profile.confidence_score or 0, confidence)
        profile.updated_at = datetime.utcnow()
        db.add(status)
        db.add(profile)
        db.commit()
        return True

    if item.type == "project":
        if not _has_meaningful(data, ["project_name", "background", "action", "result"]):
            return False
        if _is_duplicate_project(db, user_id, data):
            return False
        proj = Project(
            user_id=user_id,
            project_name=data.get("project_name"),
            background=data.get("background"),
            action=data.get("action"),
            result=data.get("result"),
            source=source,
            confidence=confidence,
        )
        db.add(proj)
        db.commit()
        return True

    if item.type in ("skill", "skill_memory"):
        skill_name = data.get("skill_name") or data.get("skill")
        if not skill_name:
            return False
        existing = (
            db.query(Skill)
            .filter(Skill.user_id == user_id, Skill.skill_name == skill_name)
            .first()
        )
        if existing:
            if data.get("level"):
                existing.level = int(data["level"])
            existing.confidence = max(existing.confidence or 0, confidence)
            db.commit()
            return True
        skill = Skill(
            user_id=user_id,
            skill_name=str(skill_name),
            level=int(data["level"]) if data.get("level") else None,
            source=source,
            confidence=confidence,
        )
        db.add(skill)
        db.commit()
        return True

    if item.type == "gap_memory":
        from app.services.career_status_service import get_or_create_career_status

        status = get_or_create_career_status(db, user_id)
        if data.get("strength"):
            status.strength = str(data["strength"])
        if data.get("gap"):
            status.weakness = str(data["gap"])
            focuses = list(status.focus_areas or [])
            if data["gap"] not in focuses:
                focuses.insert(0, str(data["gap"]))
            status.focus_areas = focuses[:5]
        if data.get("target_position"):
            profile = get_or_create_profile(db, user_id)
            profile.target_position = str(data["target_position"])
            profile.updated_at = datetime.utcnow()
            db.add(profile)
        status.updated_at = datetime.utcnow()
        db.add(status)
        db.commit()
        return True

    if item.type == "progress_memory":
        from app.services.task_memory_service import create_or_update_task, infer_goal

        note = str(data.get("note") or data.get("goal") or "求职准备")
        create_or_update_task(
            db,
            user_id,
            goal=infer_goal(note),
            task_type="job_search",
            completed_step=str(data["completed"]) if data.get("completed") else None,
            next_action=str(data["pending"]) if data.get("pending") else None,
            meta={"from": "progress_memory"},
        )
        return True

    return False


def _has_meaningful(data: dict, keys: list[str]) -> bool:
    return any(data.get(k) for k in keys)


def _is_duplicate_experience(db: Session, user_id: uuid.UUID, data: dict) -> bool:
    query = db.query(Experience).filter(Experience.user_id == user_id)
    if data.get("position"):
        query = query.filter(Experience.position == data["position"])
    if data.get("company"):
        query = query.filter(Experience.company == data["company"])
    if data.get("responsibility"):
        # Fuzzy: same responsibility prefix already stored
        existing = query.all()
        resp = str(data["responsibility"])
        for row in existing:
            if row.responsibility and (
                resp in row.responsibility or row.responsibility in resp
            ):
                return True
        return False
    return query.first() is not None


def format_extraction_summary(extractions: list[MemoryExtraction]) -> str:
    """Human-readable confirmation of what was remembered."""
    lines: list[str] = []
    for item in extractions:
        data = item.data or {}
        if item.type in ("experience",):
            bits = [b for b in [data.get("position"), data.get("company"), data.get("responsibility"), data.get("achievement")] if b]
            if bits:
                lines.append("经历：" + "｜".join(str(b) for b in bits))
        elif item.type == "project":
            bits = [b for b in [data.get("project_name"), data.get("action"), data.get("result")] if b]
            if bits:
                lines.append("项目：" + "｜".join(str(b) for b in bits))
        elif item.type in ("skill", "skill_memory"):
            name = data.get("skill_name") or data.get("skill")
            if name:
                lines.append(f"技能：{name}")
        elif item.type in ("career_goal", "goal_memory"):
            if data.get("target_position"):
                lines.append(f"目标岗位：{data['target_position']}")
        elif item.type == "constraint_memory":
            c = data.get("constraint") or data.get("fact")
            if c:
                lines.append(f"约束：{c}")
        elif item.type in ("profile", "fact_memory"):
            if data.get("experience_year") is not None:
                lines.append(f"工作年限：{data['experience_year']}年")
            fact = data.get("summary") or data.get("fact")
            if fact:
                lines.append(f"事实：{fact}")
        elif item.type == "gap_memory":
            if data.get("gap"):
                lines.append(f"缺口：{data['gap']}")
            if data.get("strength"):
                lines.append(f"优势：{data['strength']}")
    return "\n".join(f"- {x}" for x in lines[:8])


def rule_based_extractions(user_message: str) -> list[MemoryExtraction]:
    """Lightweight fallback when LLM returns empty but message clearly carries career facts."""
    text = (user_message or "").strip()
    if not text:
        return []
    items: list[MemoryExtraction] = []

    # Constraints / negations first
    if any(k in text for k in ["没有真实", "没有企业级", "只是上过", "只上过", "不要虚构", "不希望虚构", "别编"]):
        items.append(
            MemoryExtraction(
                type="constraint_memory",
                importance_score=10,
                data={"constraint": text, "topic": "RAG" if "RAG" in text.upper() or "rag" in text.lower() else None},
            )
        )

    # Year correction — prefer 「是/改为 X 年」, avoid picking the negated year
    years_value = _extract_corrected_years(text)
    if years_value is not None:
        items.append(
            MemoryExtraction(
                type="profile",
                importance_score=10,
                data={"experience_year": years_value, "fact": f"工作年限纠正为{years_value}年"},
            )
        )

    # Target role
    if any(k in text for k in ["目标岗位", "想做", "尤其想做", "转AI", "转岗"]):
        pos = None
        m = re.search(r"(?:目标岗位是|想做|转)\s*([^\n，。,]{2,30})", text)
        if m:
            pos = m.group(1).strip()
        if "AI产品" in text:
            pos = pos or "AI产品经理"
        if pos:
            items.append(
                MemoryExtraction(
                    type="career_goal",
                    importance_score=9,
                    data={"target_position": pos},
                )
            )

    # Skills list
    if "技能" in text:
        skills_blob = text
        for sep in ["是", "：", ":"]:
            if sep in text:
                skills_blob = text.split(sep, 1)[-1]
                break
        for part in re.split(r"[、,，/；;]", skills_blob):
            name = part.strip()
            if 2 <= len(name) <= 20 and not any(x in name for x in ["我的", "主要", "技能"]):
                items.append(
                    MemoryExtraction(
                        type="skill",
                        importance_score=8,
                        data={"skill_name": name},
                    )
                )

    # Experience / project narrative
    if any(k in text for k in ["负责", "做过", "经历", "项目", "DAU", "留存", "CTR", "A/B", "增长"]):
        if any(k in text for k in ["项目", "A/B", "CTR", "D1", "实验"]):
            items.append(
                MemoryExtraction(
                    type="project",
                    importance_score=10,
                    data={
                        "project_name": "增长相关项目" if "增长" in text else "用户提及项目",
                        "background": text[:120],
                        "action": text,
                        # Keep non-empty so persistence (_has_meaningful) always succeeds
                        "result": text if any(k in text for k in ["提升", "%", "点"]) else "结果待补充",
                    },
                )
            )
        else:
            items.append(
                MemoryExtraction(
                    type="experience",
                    importance_score=10,
                    data={
                        "position": "产品经理" if "产品" in text else "相关岗位",
                        "responsibility": text,
                        "achievement": text if any(k in text for k in ["提升", "增长", "优化"]) else "成就待补充",
                    },
                )
            )

    # Deduplicate by type+str(data)
    seen: set[str] = set()
    unique: list[MemoryExtraction] = []
    for it in items:
        key = f"{it.type}:{sorted(it.data.items())}"
        if key in seen:
            continue
        seen.add(key)
        unique.append(it)
    return unique


def _is_duplicate_project(db: Session, user_id: uuid.UUID, data: dict) -> bool:
    if not data.get("project_name"):
        return False
    return (
        db.query(Project)
        .filter(Project.user_id == user_id, Project.project_name == data["project_name"])
        .first()
        is not None
    )


def _extract_constraint_lines(summary: str | None) -> list[str]:
    if not summary:
        return []
    return [ln.strip() for ln in str(summary).splitlines() if ln.strip().startswith("【约束】")]


def _merge_summary_preserving_constraints(existing: str | None, new_body: str) -> str:
    """Rewrite summary body but never drop 【约束】 lines."""
    constraints = _extract_constraint_lines(existing)
    body = (new_body or "").strip()
    # Strip any constraint markers from body to avoid duplicates; re-append below
    body_lines = [ln for ln in body.splitlines() if not ln.strip().startswith("【约束】")]
    body = "\n".join(body_lines).strip() or body
    if constraints:
        merged = f"{body}\n" + "\n".join(constraints) if body else "\n".join(constraints)
        return merged.strip()
    return body


def _extract_corrected_years(text: str) -> int | None:
    """Parse year corrections like「不是3年，是5年」→ 5."""
    if not text:
        return None
    found = re.findall(r"(\d+)\s*年", text)
    if not found:
        return None
    # Corrections / negations: take the last stated year
    if any(k in text for k in ["纠正", "不是", "改为", "改成", "更正"]):
        return int(found[-1])
    m2 = re.search(r"(?:工作年限|年限)[^\d]{0,8}(\d+)\s*年", text)
    if m2:
        return int(m2.group(1))
    return int(found[0])


def _refresh_profile_summary(db: Session, user_id: uuid.UUID) -> None:
    profile = get_or_create_profile(db, user_id)
    experiences = db.query(Experience).filter(Experience.user_id == user_id).limit(3).all()
    parts: list[str] = []
    for exp in experiences:
        if exp.position:
            parts.append(exp.position)
        if exp.responsibility:
            parts.append(exp.responsibility)
    if profile.target_position:
        parts.append(f"目标：{profile.target_position}")
    if parts:
        profile.career_summary = _merge_summary_preserving_constraints(
            profile.career_summary,
            "；".join(parts),
        )
        profile.updated_at = datetime.utcnow()
        db.commit()


def get_full_profile(db: Session, user_id: uuid.UUID | None = None) -> dict:
    user = get_or_create_dev_user(db) if user_id is None else db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise ValueError("User not found")

    profile = db.query(CareerProfile).filter(CareerProfile.user_id == user.id).first()
    experiences = db.query(Experience).filter(Experience.user_id == user.id).all()
    projects = db.query(Project).filter(Project.user_id == user.id).all()
    skills = db.query(Skill).filter(Skill.user_id == user.id).all()

    return {
        "profile": profile,
        "experiences": experiences,
        "projects": projects,
        "skills": skills,
    }
