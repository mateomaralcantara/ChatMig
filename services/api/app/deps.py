from typing import Optional
from openai import OpenAI
from supabase import Client, create_client

from .settings import get_settings

settings = get_settings()

# OpenAI
openai_client = OpenAI(api_key=settings.OPENAI_API_KEY)
OPENAI_MODEL = settings.OPENAI_MODEL
EMBED_MODEL = settings.EMBED_MODEL

# Supabase (opcional)
supabase: Optional[Client] = None
if settings.SUPABASE_URL and settings.SUPABASE_SERVICE_ROLE_KEY:
    supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)
