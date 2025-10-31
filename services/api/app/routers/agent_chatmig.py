# app/routes/agent_chatmig.py
from __future__ import annotations
import os
import time
from typing import Any, Dict, List, Optional

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel

router = APIRouter(prefix="/agent", tags=["agent-chatmig"])

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
OPENAI_URL = "https://api.openai.com/v1/chat/completions"

if not OPENAI_API_KEY:
    # No explotamos aquí para no romper el arranque;
    # devolvemos 500 cuando llamen al endpoint sin API key.
    pass

# ===== Memoria simple en RAM por sesión =====
_MEM: Dict[str, List[Dict[str, str]]] = {}
_MAX_TURNS = 12  # últimos 12 mensajes (user/assistant)

def sys_prompt() -> str:
    return (
        "Eres **ChatMig**, un asistente experto en migración para países de "
        "LatAm hacia EEUU/España/Europa. Respondes en español, con tono claro, "
        "empático y directo. Das:\n"
        "- requisitos/documentos\n- costos aproximados\n- tiempos estimados\n"
        "- pasos accionables (checklist)\n"
        "Incluye una cita corta entre «» si aporta valor. Evita relleno."
    )

def build_messages(session_id: Optional[str], user_text: str, style: Dict[str, Any]) -> List[Dict[str, str]]:
    messages: List[Dict[str, str]] = [{"role": "system", "content": sys_prompt()}]

    # memoria previa
    if session_id and session_id in _MEM:
        messages.extend(_MEM[session_id][-(_MAX_TURNS):])

    # estilo opcional (no forzamos, solo sugerimos)
    tone = style.get("tone") or "claro, empático y directo"
    audience = style.get("audience") or "principiante"
    length_words = style.get("length_words") or 300
    guidelines = style.get("guidelines") or (
        "Da pasos claros, menciona requisitos/documentos, sugiere tiempos y costos aproximados. "
        "Usa «» para 1 cita útil. Evita relleno."
    )

    style_msg = (
        f"Estilo: tono={tone}; audiencia={audience}; largo≈{length_words} palabras. "
        f"Instrucciones: {guidelines}"
    )
    messages.append({"role": "system", "content": style_msg})

    messages.append({"role": "user", "content": user_text})
    return messages

def remember(session_id: Optional[str], user: str, assistant: str) -> None:
    if not session_id:
        return
    conv = _MEM.setdefault(session_id, [])
    conv.append({"role": "user", "content": user})
    conv.append({"role": "assistant", "content": assistant})
    # recorta memoria
    if len(conv) > 2 * _MAX_TURNS:
        _MEM[session_id] = conv[-(2 * _MAX_TURNS):]

# ===== Schemas =====
class AgentRequest(BaseModel):
    query: str
    session_id: Optional[str] = None
    style: Dict[str, Any] = {}

# ===== Respuesta no-stream =====
@router.post("/complete")
async def agent_complete(req: AgentRequest):
    if not OPENAI_API_KEY:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY no configurada")

    messages = build_messages(req.session_id, req.query, req.style)

    payload = {
        "model": OPENAI_MODEL,
        "temperature": 0.2,
        "messages": messages,
        "stream": False,
    }

    headers = {"Authorization": f"Bearer {OPENAI_API_KEY}", "Content-Type": "application/json"}

    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.post(OPENAI_URL, json=payload, headers=headers)
        if r.status_code != 200:
            raise HTTPException(status_code=500, detail=f"LLM error: {r.text}")

        data = r.json()
        answer = data["choices"][0]["message"]["content"].strip()
        remember(req.session_id, req.query, answer)
        return JSONResponse({"answer": answer})

# ===== Respuesta stream (NDJSON deltas) =====
@router.post("/complete/stream")
async def agent_complete_stream(req: AgentRequest):
    if not OPENAI_API_KEY:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY no configurada")

    messages = build_messages(req.session_id, req.query, req.style)

    payload = {
        "model": OPENAI_MODEL,
        "temperature": 0.2,
        "messages": messages,
        "stream": True,
    }
    headers = {"Authorization": f"Bearer {OPENAI_API_KEY}", "Content-Type": "application/json"}

    async def gen():
        acc = []
        sent_any = False
        async with httpx.AsyncClient(timeout=None) as client:
            async with client.stream("POST", OPENAI_URL, json=payload, headers=headers) as resp:
                if resp.status_code != 200:
                    detail = await resp.aread()
                    yield f'{{"type":"error","error":{detail.decode("utf-8")!s}}}\n'
                    return
                async for line in resp.aiter_lines():
                    if not line:
                        continue
                    if line.startswith("data: "):
                        chunk = line[6:].strip()
                    else:
                        chunk = line.strip()
                    if chunk == "[DONE]":
                        break
                    try:
                        obj = httpx.Response(200, content=chunk).json()
                    except Exception:
                        continue
                    for choice in obj.get("choices", []):
                        delta = choice.get("delta", {}).get("content")
                        if delta:
                            acc.append(delta)
                            sent_any = True
                            yield f'{{"type":"delta","content":{delta.__repr__()}}}\n'
        # cierre
        full = "".join(acc).strip()
        if sent_any:
            yield '{"type":"done"}\n'
        if full:
            remember(req.session_id, req.query, full)

    return StreamingResponse(gen(), media_type="application/x-ndjson")
