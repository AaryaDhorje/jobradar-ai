from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BACKEND_DIR / "data"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = f"sqlite:///{(DATA_DIR / 'jobradar.db').as_posix()}"
    timezone: str = "Asia/Kolkata"
    default_scan_time: str = "08:00"
    enable_scheduler: bool = True
    enable_unofficial_sources: bool = True

    # AI: any OpenAI-compatible provider. Leave AI_PROVIDER empty to detect it from the key's prefix.
    ai_provider: str = ""
    ai_api_key: str = ""
    ai_model: str = ""
    ai_base_url: str = ""
    # Kept for backwards compatibility with older .env files
    openai_api_key: str = ""
    openai_model: str = ""

    # Job APIs
    adzuna_app_id: str = ""
    adzuna_app_key: str = ""
    jooble_api_key: str = ""
    rapidapi_key: str = ""
    jsearch_max_requests_per_scan: int = 6

    # Contacts
    hunter_api_key: str = ""

    # Search scope
    max_job_age_days: int = 30
    http_timeout_s: float = 25.0
    scraper_timeout_s: float = 240.0

    def ai_config(self) -> dict[str, str]:
        """Resolve provider, key, model and endpoint for the AI features."""
        key = self.ai_api_key or self.openai_api_key
        provider = (self.ai_provider or _detect_provider(key)).lower()
        preset = AI_PRESETS.get(provider, AI_PRESETS["openai"])
        if provider == "ollama":
            key = key or "ollama"  # local server ignores the key
        model = self.ai_model or (self.openai_model if provider == "openai" else "") or preset["model"]
        return {"provider": provider, "label": preset["label"], "api_key": key, "model": model,
                "base_url": self.ai_base_url or preset["base_url"]}

    def key_status(self) -> dict[str, bool]:
        return {
            "ai": bool(self.ai_config()["api_key"]),
            "hunter": bool(self.hunter_api_key),
            "adzuna": bool(self.adzuna_app_id and self.adzuna_app_key),
            "jooble": bool(self.jooble_api_key),
            "rapidapi": bool(self.rapidapi_key),
        }


AI_PRESETS: dict[str, dict[str, str]] = {
    "gemini": {"label": "Google Gemini", "model": "gemini-3.5-flash",
               "base_url": "https://generativelanguage.googleapis.com/v1beta/openai/"},
    "groq": {"label": "Groq", "model": "llama-3.3-70b-versatile", "base_url": "https://api.groq.com/openai/v1"},
    "openrouter": {"label": "OpenRouter", "model": "meta-llama/llama-3.3-70b-instruct:free",
                   "base_url": "https://openrouter.ai/api/v1"},
    "ollama": {"label": "Ollama (local)", "model": "llama3.1:8b", "base_url": "http://localhost:11434/v1"},
    "openai": {"label": "OpenAI", "model": "gpt-5.4-mini", "base_url": ""},
}


def _detect_provider(key: str) -> str:
    if key.startswith(("AIza", "AQ.")):  # Google AI Studio: classic and newer key formats
        return "gemini"
    if key.startswith("gsk_"):
        return "groq"
    if key.startswith("sk-or-"):
        return "openrouter"
    return "openai"


@lru_cache
def get_settings() -> Settings:
    return Settings()


# Search queries sent to keyword-based sources.
SEARCH_QUERIES = [
    "artificial intelligence",
    "machine learning",
    "AI engineer",
    "data scientist",
    "generative AI",
    "LLM",
    "deep learning",
    "NLP",
    "computer vision",
    "MLOps",
]

# Locations sent to location-aware sources: Pune first, then the whole country.
SEARCH_LOCATIONS = ["Pune", "India"]
