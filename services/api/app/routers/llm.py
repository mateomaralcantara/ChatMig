# services/api/app/routers/llm.py
from __future__ import annotations

import json
from typing import List, Optional, Literal, Iterable

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from ..deps import supabase, openai_client, OPENAI_MODEL, EMBED_MODEL

router = APIRouter(prefix="/llm", tags=["llm"])

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
    top_k: int = Field(default=5, ge=1, le=24)
    style: Optional[StyleIn] = None


class Chunk(BaseModel):
    content: str
    similarity: float


class ChatOut(BaseModel):
    answer: str
    retrieved: List[Chunk] = Field(default_factory=list)


SYSTEM_PROMPT = (
    "Eres ChatSed, coach de comunicación y seducción ética. "
    "Da consejos claros, respeta consentimiento y límites, evita manipulación. "
    "Si hay señales rojas, señálalas y recomienda cómo actuar con respeto. "
    "Responde en español de forma didáctica, concreta y empática."
)

# --------- Helpers ---------
def _jsonl(obj: dict) -> str:
    return json.dumps(obj, ensure_ascii=False) + "\n"


def _style_block(s: Optional[StyleIn]) -> str:
    if not s:
        return ""
    lines: list[str] = []
    if s.length_words:
        lines.append(f"Extensión objetivo: ~{s.length_words} palabras (±20%).")
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
    lines.append("Señala riesgos/banderas rojas y cómo gestionarlas con respeto.")
    return "\n".join(lines)


def _retrieve_context(q: str, k: int) -> tuple[list[dict], str]:
    """
    Hace embedding + RPC en Supabase y devuelve:
      - filas crudas (dicts con content/similarity)
      - contexto concatenado legible
    Si falla, devuelve vacío sin romper flujo.
    """
    try:
        emb = openai_client.embeddings.create(model=EMBED_MODEL, input=q)
        query_vec = emb.data[0].embedding

        rpc = supabase.rpc(
            "match_knowledge",
            {"query_embedding": query_vec, "match_count": k},
        ).execute()
        rows = rpc.data or []
    except Exception:
        rows = []

    ctx_texts = [r.get("content", "") for r in rows]
    context = "\n\n".join([f"[Contexto #{i+1}] {c}" for i, c in enumerate(ctx_texts)])
    return rows, context


# --------- Endpoint JSON (fallback/compat) ---------
@router.post("/complete", response_model=ChatOut)
def complete(body: ChatIn):
    q = (body.query or "").strip()
    if not q:
        raise HTTPException(status_code=400, detail="Empty query")

    k = max(1, min(body.top_k or 5, 24))
    rows, context = _retrieve_context(q, k)
    retrieved = [
        Chunk(content=r.get("content", ""), similarity=float(r.get("similarity", 0)))
        for r in rows
    ]

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "system", "content": f"Guías de estilo:\n{_style_block(body.style)}"},
        {"role": "system", "content": f"Contexto externo (puede estar incompleto):\n{context}"},
        {"role": "user", "content": q},
    ]
    try:
        resp = openai_client.chat.completions.create(
            model=OPENAI_MODEL, messages=messages, temperature=0.4
        )
        answer = resp.choices[0].message.content
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"LLM error: {type(e).__name__}") from e

    return ChatOut(answer=answer, retrieved=retrieved)


# --------- Endpoint STREAMING NDJSON (recomendado) ---------
@router.post("/complete/stream")
def complete_stream(body: ChatIn):
    q = (body.query or "").strip()
    if not q:
        raise HTTPException(status_code=400, detail="Empty query")

    k = max(1, min(body.top_k or 5, 24))

    def iter_events() -> Iterable[str]:
        # 1) Recuperación
        rows, context = _retrieve_context(q, k)
        chunks = [
            {"content": r.get("content", ""), "similarity": float(r.get("similarity", 0))}
            for r in rows
        ]
        # Emitimos fuentes primero
        yield _jsonl({"type": "retrieved", "chunks": chunks})

        # 2) LLM stream
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "system", "content": f"Guías de estilo:\n{_style_block(body.style)}"},
            {"role": "system", "content": f"Contexto externo (puede estar incompleto):\n{context}"},
            {"role": "user", "content": q},
        ]
        try:
            stream = openai_client.chat.completions.create(
                model=OPENAI_MODEL, messages=messages, temperature=0.4, stream=True
            )
            for chunk in stream:
                delta = chunk.choices[0].delta.content or ""
                if delta:
                    yield _jsonl({"type": "delta", "content": delta})
            yield _jsonl({"type": "done"})
        except Exception as e:
            yield _jsonl({"type": "error", "error": f"{type(e).__name__}: {str(e)}"})
            yield _jsonl({"type": "done"})

    return StreamingResponse(iter_events(), media_type="application/x-ndjson")
