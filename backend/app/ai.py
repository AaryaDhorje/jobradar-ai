"""OpenAI-powered company insights, interview prep and resume advice."""

import json
import logging
from typing import Any, Optional

import httpx
from openai import AsyncOpenAI, BadRequestError

from .config import get_settings
from .models import Company, Job
from .pipeline import html_to_text
from .scrapers.base import BROWSER_HEADERS

log = logging.getLogger(__name__)


class AIUnavailable(Exception):
    pass


SUMMARY_SHAPE: dict[str, Any] = {
    "overview": "", "what_they_do": [], "products": [], "tech_stack": [], "size_and_stage": "",
    "culture": [], "india_presence": "", "why_join": [], "watch_outs": [],
}
INTERVIEW_SHAPE: dict[str, Any] = {
    "process": [], "technical_topics": [], "sample_questions": [], "behavioral_questions": [], "tips": [],
    "questions_to_ask": [],
}
ADVICE_SHAPE: dict[str, Any] = {
    "match_score": None, "verdict": "", "strengths": [], "gaps": [], "missing_keywords": [], "improvements": [],
    "bullet_rewrites": [], "recommended_format": "", "tailored_summary": "", "ats_tips": [],
}


def shape(data: Any, template: dict[str, Any]) -> dict[str, Any]:
    """Guarantee every key exists with the right container type, so the UI never breaks on model drift."""
    data = data if isinstance(data, dict) else {}
    out = {}
    for key, default in template.items():
        v = data.get(key, default)
        if isinstance(default, list) and not isinstance(v, list):
            v = [v] if v else []
        elif isinstance(default, str) and not isinstance(v, str):
            v = "" if v is None else (json.dumps(v) if isinstance(v, (dict, list)) else str(v))
        out[key] = v
    return out


async def _complete_json(system: str, user: str, max_tokens: int = 6000) -> dict:
    cfg = get_settings().ai_config()
    if not cfg["api_key"]:
        raise AIUnavailable("No AI API key is set. Add AI_API_KEY to backend/.env (a free Google Gemini or Groq "
                            "key works) and restart the app.")
    client = AsyncOpenAI(api_key=cfg["api_key"], base_url=cfg["base_url"] or None, timeout=180)
    kwargs: dict[str, Any] = dict(
        model=cfg["model"],
        messages=[{"role": "system", "content": system + "\nReply with a single JSON object and nothing else."},
                  {"role": "user", "content": user}],
        response_format={"type": "json_object"},
        max_completion_tokens=max_tokens,
        reasoning_effort="low",
    )
    # Providers differ in which optional parameters they accept: drop the rejected one and retry.
    for _ in range(4):
        try:
            resp = await client.chat.completions.create(**kwargs)
            break
        except BadRequestError as e:
            msg = str(e).lower()
            if "reasoning" in msg and "reasoning_effort" in kwargs:
                kwargs.pop("reasoning_effort")
            elif ("response_format" in msg or "json" in msg) and "response_format" in kwargs:
                kwargs.pop("response_format")
            elif "max_completion_tokens" in msg and "max_completion_tokens" in kwargs:
                kwargs["max_tokens"] = kwargs.pop("max_completion_tokens")
            else:
                raise
    else:
        raise AIUnavailable("The AI provider rejected the request. Check AI_MODEL in backend/.env.")
    return parse_json(resp.choices[0].message.content or "")


def parse_json(content: str) -> dict:
    """Parse a JSON object, tolerating code fences or text around it (common with open models)."""
    try:
        data = json.loads(content)
    except json.JSONDecodeError:
        start, end = content.find("{"), content.rfind("}")
        try:
            data = json.loads(content[start:end + 1]) if start != -1 and end > start else None
        except json.JSONDecodeError:
            data = None
    if not isinstance(data, dict):
        log.warning("model returned non-JSON: %s", content[:200])
        raise AIUnavailable("The AI response could not be read. Please try again.")
    return data


async def fetch_site_text(domain: Optional[str], limit: int = 5000) -> str:
    if not domain:
        return ""
    texts = []
    async with httpx.AsyncClient(timeout=12, follow_redirects=True, headers=BROWSER_HEADERS) as client:
        for path in ("", "/about", "/about-us", "/company"):
            try:
                r = await client.get(f"https://{domain}{path}")
                if r.status_code == 200 and "html" in r.headers.get("content-type", ""):
                    texts.append(html_to_text(r.text)[:2500])
            except Exception:
                continue
            if sum(len(t) for t in texts) > limit:
                break
    return "\n\n".join(texts)[:limit]


COMPANY_SYSTEM = """You are a senior career coach and tech-industry analyst helping a candidate in India \
(based in Pune) who is applying for AI/ML roles. Be specific and practical. Use the provided website text and \
job descriptions as primary evidence and your own knowledge second. Never invent precise numbers \
(revenue, headcount, funding) — give ranges or say "not publicly confirmed". If you know little about the \
company, say so in overview and base advice on the job descriptions. Respond with JSON only."""


async def company_insights(company: Company, jobs: list[Job]) -> dict:
    site = await fetch_site_text(company.domain)
    roles = "\n\n".join(
        f"### {j.title} ({j.location})\n{(j.description or '')[:1800]}" for j in jobs[:4]
    ) or "(no job descriptions available)"
    user = f"""Company: {company.name}
Website: {company.website or company.domain or 'unknown'}

Website text (may be partial):
{site or '(could not fetch website)'}

Open AI/ML roles at this company:
{roles}

Return JSON with exactly this structure:
{{
  "summary": {{
    "overview": "3-5 sentence plain-English description of what the company is and does",
    "what_they_do": ["key business lines / what problems they solve"],
    "products": ["main products or services"],
    "tech_stack": ["languages, frameworks, cloud, ML tools they likely use (from JDs and knowledge)"],
    "size_and_stage": "startup/scale-up/enterprise, rough size, public/private, funding stage if known",
    "culture": ["work culture signals"],
    "india_presence": "offices in India (esp. Pune), what the India team works on",
    "why_join": ["reasons this is a good place for an AI/ML career"],
    "watch_outs": ["honest things to check before joining"]
  }},
  "interview": {{
    "process": [{{"round": "round name", "description": "what happens and how to prepare"}}],
    "technical_topics": ["topics to revise for these roles"],
    "sample_questions": [{{"question": "likely technical question", "how_to_answer": "how to approach it"}}],
    "behavioral_questions": ["likely behavioral/HR questions"],
    "tips": ["specific tips to stand out at this company"],
    "questions_to_ask": ["smart questions the candidate can ask the interviewer"]
  }}
}}
Give 4-6 process rounds, 8-12 technical topics, 8-10 sample questions, 5 behavioral questions, 6 tips, 5 questions to ask."""
    data = await _complete_json(COMPANY_SYSTEM, user, max_tokens=9000)
    return {"summary": shape(data.get("summary"), SUMMARY_SHAPE), "interview": shape(data.get("interview"), INTERVIEW_SHAPE)}


RESUME_SYSTEM = """You are an expert technical recruiter and resume writer for AI/ML roles in India. You know how \
ATS systems (Naukri RMS, Workday, Greenhouse, Lever) parse resumes. Give concrete, honest, actionable advice. \
Never suggest adding experience the candidate does not have; suggest how to surface relevant real experience \
or what to learn/build instead. Respond with JSON only."""


async def resume_advice(job: Job, company: Company, resume_text: Optional[str]) -> dict:
    job_block = f"""Job title: {job.title}
Company: {company.name}
Location: {job.location}
Experience: {job.experience or 'not stated'}
Skills/tags: {', '.join(job.tags) if job.tags else 'n/a'}
Description:
{(job.description or '(description not available — infer from title, company and skills)')[:6000]}"""
    if resume_text:
        task = f"""Candidate resume:
{resume_text[:9000]}

Compare the resume with the job. match_score is 0-100 for how well the resume as written fits this job."""
    else:
        task = """The candidate has not uploaded a resume. Describe the ideal resume for this job instead:
set match_score to null, strengths = what the ideal candidate's resume must show, gaps = common reasons resumes \
get rejected for this role, bullet_rewrites = examples of weak vs strong bullet points for this role."""
    user = f"""{job_block}

{task}

Return JSON with exactly this structure:
{{
  "match_score": 0,
  "verdict": "2-3 sentence honest assessment",
  "strengths": ["..."],
  "gaps": ["..."],
  "missing_keywords": ["exact keywords/skills from the JD to include if true"],
  "improvements": [{{"section": "Summary|Skills|Experience|Projects|Education|Certifications|Format", "suggestion": "..."}}],
  "bullet_rewrites": [{{"before": "weak bullet", "after": "strong, quantified bullet"}}],
  "recommended_format": "which resume format/structure/length suits this company and role, and why",
  "tailored_summary": "a ready-to-use 3-4 line professional summary tailored to this job",
  "ats_tips": ["ATS tips specific to this application"]
}}"""
    data = await _complete_json(RESUME_SYSTEM, user, max_tokens=7000)
    out = shape(data, ADVICE_SHAPE)
    if not resume_text:
        out["match_score"] = None
    elif out["match_score"] is not None:
        try:
            out["match_score"] = max(0, min(100, int(out["match_score"])))
        except (TypeError, ValueError):
            out["match_score"] = None
    return out
