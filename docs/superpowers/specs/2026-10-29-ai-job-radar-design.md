# JobRadar AI — Design Spec (2026-10-29)

## Goal
A single portal that collects AI/ML job openings across India daily (Pune preferred), and for each job/company gives HR contacts, resume advice, company summary and interview prep.

## Decisions (agreed with user)
- Sources: hybrid — official APIs + public ATS boards + job boards; LinkedIn guest / Naukri / Hirist marked "unofficial" and toggleable (`ENABLE_UNOFFICIAL_SOURCES`).
- AI: OpenAI (model configurable via `OPENAI_MODEL`).
- HR email: job-post regex → Hunter.io → company website → MX-checked pattern guesses (always labelled).
- Runs locally first (Windows), Docker for later cloud deploy.

## Architecture
```
backend/  FastAPI + SQLModel(SQLite) + APScheduler
  app/config.py      settings from .env
  app/models.py      Job, Company, Contact, ScanRun, Resume, ResumeAdvice, Setting
  app/scrapers/      one module per source, common Scraper interface -> list[RawJob]
  app/pipeline.py    AI relevance, location tagging, fingerprint dedupe, scoring
  app/scan.py        runs all enabled scrapers concurrently, upserts jobs, records ScanRun
  app/scheduler.py   daily cron (Asia/Kolkata) + manual trigger
  app/contacts.py    HR email finder
  app/ai.py          OpenAI: company summary, interview prep, resume advice (cached in DB)
  app/main.py        REST API (+ serves built frontend)
  data/companies.yaml  ATS boards (greenhouse/lever/ashby/workable) of AI-hiring companies
frontend/ React + Vite + Tailwind
```

## Sources
| Source | Kind | Key |
|---|---|---|
| Adzuna India | official API | ADZUNA_APP_ID/KEY |
| Jooble | official API | JOOBLE_API_KEY |
| JSearch (Google Jobs: LinkedIn/Naukri/Indeed/Glassdoor listings) | official API | RAPIDAPI_KEY |
| Greenhouse / Lever / Ashby / Workable boards | public JSON | none |
| Remotive, RemoteOK | public API | none |
| Hirist.tech | unofficial JSON | none |
| LinkedIn guest search | unofficial HTML | none |
| Naukri | unofficial JSON (often captcha-blocked) | none |
FlexJobs is paywalled and is not scraped.

## Pipeline rules
- Relevance: title/description/tags match AI keyword set (ML, AI, GenAI, LLM, NLP, CV, data scientist, MLOps, deep learning, …); title matches weigh more.
- Location tag: `pune` | `india` | `remote` (remote and open to India) | dropped (outside India, not remote-India).
- Fingerprint: normalized company + normalized title + primary city → one row; additional sources appended to `sources`.
- Score (0–100): location (Pune 40, India 20, remote 25) + relevance (≤40) + freshness (≤20).
- `is_new`: first seen in the latest completed scan.

## API
- `GET /api/jobs` (q, tag, source, company_id, new_only, status, days, sort, page, page_size) → `{items,total,page,page_size}`
- `GET /api/jobs/{id}`, `PATCH /api/jobs/{id}` `{status: saved|applied|hidden|null}`
- `GET /api/jobs/{id}/contacts?refresh=` → `{company_id, domain, contacts:[{email,name,position,source,confidence}]}`
- `POST /api/jobs/{id}/resume-advice?refresh=` → advice JSON
- `GET /api/companies/{id}`, `PATCH /api/companies/{id}` `{domain}`, `POST /api/companies/{id}/insights?refresh=`
- `GET /api/stats`, `POST /api/scan`, `GET /api/scans`
- `GET/PUT /api/settings`, `GET/POST/DELETE /api/resume`

## Error handling
Each scraper runs isolated with timeout; failures recorded per source in ScanRun and shown in UI. Missing keys → source reported "not configured", not an error. AI/Hunter failures return a clear message to UI.

## Testing
pytest: pipeline (relevance, location, dedupe, score), contact extraction, each scraper's parser against saved fixtures, API smoke test.

## Out of scope (v1)
Multi-user auth, billing, email/WhatsApp alerts.
