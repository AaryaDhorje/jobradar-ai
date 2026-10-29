# JobRadar AI

**One dashboard for every AI/ML job opening in India, Pune first.**
JobRadar AI scans 14 job sources every morning, keeps only AI/ML roles, removes duplicates, ranks them
(Pune → remote → rest of India, then relevance and freshness), and gives you three AI tools for each opening:

| Feature | What you get |
|---|---|
| **Daily auto-scan** | Runs at 08:00 IST (configurable). If the PC was off, a catch-up scan runs at next start. "Scan now" any time. |
| **HR contacts** | Click a job → emails from the job post, Hunter.io HR/recruiter emails, HR inboxes published on the company site, and clearly-labelled guesses (`careers@`, `hr@`, …) on domains that accept mail. Every email shows its source and confidence. |
| **Resume tips** | Upload your resume once. For each job: match score, missing keywords, section-by-section fixes, rewritten bullets, a tailored summary, the right resume format and ATS tips. |
| **Company briefing** | Click a company → what it does, products, tech stack, size, culture, India/Pune presence, why join / watch-outs, plus interview prep: rounds, topics, sample questions with how to answer, and questions to ask. |
| **Tracking** | Save / mark applied / hide jobs; "NEW" badges for jobs found in the latest scan; filters for location, source, date, status. |

## Quick start (Windows)

1. Install **Python 3.11+**, **Node 18+** and **Google Chrome** (Chrome is used invisibly to read Naukri).
2. Double-click **`start.bat`**. The first run installs everything and opens http://127.0.0.1:8000.
3. Get a **free AI key** (Google Gemini: https://aistudio.google.com/apikey, or Groq: https://console.groq.com/keys), paste it after `AI_API_KEY=` in `backend\.env`, then restart `start.bat`.
4. Optional: run **`install-autostart.bat`** so the app starts when you log in and never misses the daily scan.

Manual start:
```bash
cd backend
python -m venv .venv && .venv\Scripts\pip install -r requirements.txt
copy .env.example .env          # add keys
cd ..\frontend && npm install && npm run build
cd ..\backend && .venv\Scripts\python -m uvicorn app.main:app --port 8000
```
Frontend development with hot reload: `cd frontend && npm run dev` (proxies `/api` to port 8000).

## API keys

| Key | Needed for | Cost |
|---|---|---|
| `AI_API_KEY` | Resume tips, company briefing, interview prep | **Free** with Google Gemini (default `gemini-3.5-flash`), Groq (`llama-3.3-70b-versatile`) or OpenRouter free models; or paid OpenAI. Provider is detected from the key; override with `AI_PROVIDER` / `AI_MODEL`. Local Ollama also works (`AI_PROVIDER=ollama`). |
| `HUNTER_API_KEY` | Verified HR/recruiter emails | Free: 25 searches/month |
| `ADZUNA_APP_ID` / `ADZUNA_APP_KEY` | Adzuna India jobs | Free |
| `JOOBLE_API_KEY` | Jooble jobs | Free |
| `RAPIDAPI_KEY` | JSearch = Google for Jobs (surfaces LinkedIn, Naukri, Indeed, Glassdoor, company-site listings) | Free: ~200 requests/month |

Without any keys the app still collects jobs from the 11 key-less sources.

## Sources

| Source | Type | Notes |
|---|---|---|
| Adzuna, Jooble, JSearch | Official APIs | Need free keys |
| Greenhouse, Lever, Ashby, Workable, SmartRecruiters, Workday | Public careers-site APIs | 111 companies in `backend/data/companies.yaml` (NVIDIA, Mastercard, Red Hat, BMC, Deutsche Bank, Barclays, Citi, Accenture, OpenAI, Anthropic, Databricks, Sarvam AI …). Add companies to `data/companies.candidates.yaml` and run `python -m scripts.validate_boards`. |
| Remotive, RemoteOK | Public APIs | Remote roles open to India/worldwide only |
| Hirist.tech, LinkedIn (guest search), Naukri | **Unofficial** | Read the public sites the way a browser does. They can break or be rate-limited, and their terms restrict automated access — see "Selling this product" below. Toggle each in Settings, or set `ENABLE_UNOFFICIAL_SOURCES=false`. |

FlexJobs is subscription-only and is not scraped.

## How it works

```
backend/app
  scrapers/     one module per source family, all return RawJob
  pipeline.py   AI-relevance check, location tagging (pune/india/remote), duplicate fingerprint, 0-100 score
  scan.py       runs enabled sources concurrently (each isolated with a timeout), stores results, records per-source status
  scheduler.py  daily cron in Asia/Kolkata + catch-up scan
  contacts.py   HR email discovery
  ai.py         prompts (any OpenAI-compatible provider) for company briefing, interview prep and resume advice (cached in the DB)
  main.py       REST API + serves the built React app
frontend/       React + TypeScript + Tailwind
```
Data is stored in `backend/data/jobradar.db` (SQLite). Set `DATABASE_URL` to use Postgres for a hosted version.

Tests: `cd backend && .venv\Scripts\pip install -r requirements-dev.txt && .venv\Scripts\python -m pytest`

## Deploying (24/7 in the cloud)

```bash
docker compose up -d --build      # serves on port 8000, data in a named volume
```
Works on any VPS or container host (Railway, Render, Fly.io, AWS Lightsail). Note: the Naukri scraper needs Google Chrome,
which the slim Docker image doesn't include — in the cloud rely on JSearch for Naukri listings, or extend the image.

## Selling this product — read first

- **Unofficial sources:** LinkedIn, Naukri and Hirist do not permit scraping in their terms of use. That's a personal-use
  risk; for a commercial product it's a legal one. Ship with `ENABLE_UNOFFICIAL_SOURCES=false` and lean on the
  licensed APIs (JSearch/Adzuna/Jooble paid tiers) and public careers-site APIs, or get partnerships.
- **HR emails:** contact data is personal data under India's DPDP Act 2023. Hunter.io is a licensed provider; keep the
  labelled "guessed" addresses clearly marked as guesses, and add a privacy policy.
- **Multi-user:** v1 is single-user (one resume, one job list). Accounts, billing and alerts are the next steps for a SaaS version.

## License

[MIT](LICENSE) © 2026 Aarya Dhorje
