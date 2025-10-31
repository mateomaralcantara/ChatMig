# services/api/app/routers/chat_stream.py
from typing import Optional, Literal, Iterable
import os

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse, PlainTextResponse
from pydantic import BaseModel

from ..deps import openai_client, OPENAI_MODEL

router = APIRouter(prefix="/chat", tags=["chatmig"])

# ===== Env & defaults (controlar desde .env) =====
SYSTEM_PROMPT = os.getenv(
    "CHATMIG_SYSTEM_PROMPT",
    (
        "Eres ChatMig, asesor migratorio claro y empático. Respondes en español neutro, "
        "das pasos operativos, requisitos, documentos, costos orientativos y tiempos. "
        "Indica riesgos/limitaciones y cómo verificarlos oficialmente. Sin relleno."
    ),
)
DEFAULT_LENGTH_WORDS = int(os.getenv("CHATMIG_DEFAULT_LENGTH_WORDS", "1000"))
TEMPERATURE = float(os.getenv("CHATMIG_TEMPERATURE", "0.4"))
MAX_TOKENS = int(os.getenv("CHATMIG_MAX_TOKENS", "4096"))

# --------- Modelos ---------
class StyleIn(BaseModel):
    tone: Optional[str] = None
    use_emojis: Optional[bool] = None
    length_words: Optional[int] = None
    format: Optional[Literal["sections", "bullets", "paragraphs"]] = None
    audience: Optional[str] = None
    language: Optional[str] = "es"
    guidelines: Optional[str] = None

class ChatIn(BaseModel):
    query: str
    style: Optional[StyleIn] = None

# --------- Helpers ---------
def _style_block(s: Optional[StyleIn]) -> str:
    # Fallback a 1000 palabras y ES si no viene estilo
    if not s:
        s = StyleIn(length_words=DEFAULT_LENGTH_WORDS, language="es")

    lines: list[str] = []
    length = s.length_words or DEFAULT_LENGTH_WORDS
    lines.append(f"Extensión objetivo: ~{length} palabras (±20%).")
    if s.format:
        lines.append(f"Estructura: usa {s.format}; evita relleno y repeticiones.")
    if s.tone:
        lines.append(f"Tono: {s.tone}.")
    if s.audience:
        lines.append(f"Audiencia: {s.audience}.")
    if s.language:
        lines.append(f"Idioma: {s.language}.")
    if s.use_emojis is not None:
        lines.append("Incluye emojis con moderación." if s.use_emojis else "No incluyas emojis.")
    if s.guidelines:
        lines.append(s.guidelines)

    # Imprescindibles
    lines.append("Explica el porqué de cada paso y da 1–2 ejemplos concretos.")
    lines.append("Señala riesgos/limitaciones y cómo verificarlos con la autoridad oficial.")
    return "Guías de estilo:\n" + "\n".join(lines)

def _stream_llm(messages: list[dict]) -> Iterable[str]:
    """Emite texto plano en streaming para que el front concatene directamente."""
    try:
        resp = openai_client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=messages,
            temperature=TEMPERATURE,
            max_tokens=MAX_TOKENS,
            stream=True,
        )
        for chunk in resp:
            delta = getattr(chunk.choices[0].delta, "content", None) or ""
            if delta:
                yield delta
    except Exception as e:
        yield f"\n\n[ChatMig] {type(e).__name__}: {str(e)}"

# --------- Endpoint: texto plano en streaming ---------
@router.post("/complete_stream", response_class=PlainTextResponse)
def complete_stream(body: ChatIn):
    q = (body.query or "").strip()
    if not q:
        raise HTTPException(status_code=400, detail="Empty query")

    messages: list[dict] = [{"role": "system", "content": SYSTEM_PROMPT}]
    style_msg = _style_block(body.style)
    if style_msg:
        messages.append({"role": "system", "content": style_msg})
    messages.append({"role": "user", "content": q})

    return StreamingResponse(_stream_llm(messages), media_type="text/plain; charset=utf-8")
