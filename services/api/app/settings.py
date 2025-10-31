# services/api/app/settings.py
from functools import lru_cache
from typing import Optional, List, Any, Union
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field, field_validator
import json

class Settings(BaseSettings):
    # --- LLM ---
    OPENAI_API_KEY: str
    OPENAI_MODEL: str = "gpt-4o-mini"
    EMBED_MODEL: str = "text-embedding-3-small"

    # --- DB / Supabase (opcionales) ---
    SUPABASE_URL: Optional[str] = None
    SUPABASE_SERVICE_ROLE_KEY: Optional[str] = None
    SUPABASE_ANON_KEY: Optional[str] = None

    # --- CORS ---
    # Acepta CSV ("http://localhost:5173,http://127.0.0.1:5173")
    # o JSON (["http://localhost:5173","http://127.0.0.1:5173"])
    ALLOWED_ORIGINS: List[str] = Field(
        default_factory=lambda: ["http://localhost:5173", "http://127.0.0.1:5173"]
    )

    # --- Estilo/Filosofía por defecto para el LLM (overridable en .env) ---
    # Puedes pegar aquí cualquiera de los perfiles que te pasé
    DEFAULT_STYLE_JSON: str = Field(
        default=(
            '{"persona":"coach cálido y ético","tone":"cálido","dialect":"es-Latam",'
            '"use_emojis":true,"summary_words":40,"script_words":40,'
            '"max_bullets":4,"format":"json","temperature":0.6,"max_tokens":400}'
        )
    )

    # --- Config de pydantic-settings ---
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",  # evita error por variables no mapeadas
    )

    # Permite ALLOWED_ORIGINS en .env como CSV o JSON
    @field_validator("ALLOWED_ORIGINS", mode="before")
    @classmethod
    def _parse_allowed_origins(cls, v: Union[str, List[str]]) -> List[str]:
        if isinstance(v, list):
            return [str(x).strip() for x in v if str(x).strip()]
        if isinstance(v, str):
            txt = v.strip()
            # Si parece JSON, intentamos parsear
            if (txt.startswith("[") and txt.endswith("]")) or (txt.startswith('"') and txt.endswith('"')):
                try:
                    parsed = json.loads(txt)
                    if isinstance(parsed, list):
                        return [str(x).strip() for x in parsed if str(x).strip()]
                except Exception:
                    pass
            # Fallback: CSV
            return [s.strip() for s in txt.split(",") if s.strip()]
        return v  # deja pasar valor ya tipado

    # Helper cómodo para usar en CORS
    def allowed_origins_list(self) -> List[str]:
        return list(self.ALLOWED_ORIGINS)

    # Helper para obtener el dict de estilo ya parseado (seguro)
    def default_style_dict(self) -> dict:
        try:
            data = json.loads(self.DEFAULT_STYLE_JSON or "{}")
            return data if isinstance(data, dict) else {}
        except Exception:
            return {}

@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
