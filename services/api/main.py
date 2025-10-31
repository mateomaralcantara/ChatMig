from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
import os, json, httpx, asyncio
from fastapi import FastAPI
from payments.paypal import router as paypal_router

app = FastAPI()
app.include_router(paypal_router, prefix="/api")

FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_ORIGIN],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

OPENAI_API_KEY   = os.getenv("OPENAI_API_KEY", "")
OPENAI_BASE      = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
OPENAI_MODEL_DEF = os.getenv("OPENAI_MODEL", "gpt-4.1-mini")

ANTHROPIC_API_KEY   = os.getenv("ANTHROPIC_API_KEY", "")
ANTHROPIC_MODEL_DEF = os.getenv("ANTHROPIC_MODEL", "claude-3-5-haiku-latest")
ANTHROPIC_VERSION   = os.getenv("ANTHROPIC_VERSION", "2023-06-01")

MISTRAL_API_KEY   = os.getenv("MISTRAL_API_KEY", "")
MISTRAL_BASE      = os.getenv("MISTRAL_BASE_URL", "https://api.mistral.ai/v1")
MISTRAL_MODEL_DEF = os.getenv("MISTRAL_MODEL", "mistral-small")

GEMINI_API_KEY    = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL_DEF  = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")
GEMINI_BASE       = os.getenv("GEMINI_API_BASE", "https://generativelanguage.googleapis.com/v1beta")

SYSTEM_PROMPT     = os.getenv("CHATMIG_SYSTEM_PROMPT", "Eres ChatMig...")
MAX_TOKENS        = int(os.getenv("CHATMIG_MAX_TOKENS", "2048"))
TEMPERATURE       = float(os.getenv("CHATMIG_TEMPERATURE", "0.4"))

def _user_msgs(messages):
    # Filtra/normaliza mensajes del front [{role, content}]
    system = next((m["content"] for m in messages if m["role"]=="system"), "")
    rest = [m for m in messages if m["role"]!="system"]
    return system, rest

@app.post("/chat/complete_stream")
async def chat_complete_stream(req: Request):
    body = await req.json()
    provider = (body.get("provider") or "openai").lower()    # 'openai' | 'anthropic' | 'mistral' | 'google'
    model = body.get("model")
    messages = body.get("messages", [])
    system, conv = _user_msgs(messages)

    async def ndjson_gen():
        try:
            if provider == "openai":
                async for chunk in stream_openai(conv, model or OPENAI_MODEL_DEF, system):
                    yield chunk
            elif provider == "anthropic":
                async for chunk in stream_anthropic(conv, model or ANTHROPIC_MODEL_DEF, system):
                    yield chunk
            elif provider == "mistral":
                async for chunk in stream_mistral(conv, model or MISTRAL_MODEL_DEF, system):
                    yield chunk
            elif provider in ("google","gemini"):
                async for chunk in stream_gemini(conv, model or GEMINI_MODEL_DEF, system):
                    yield chunk
            else:
                yield _delta("Provider no soportado")
            yield _done()
        except Exception as e:
            yield _delta(f"[error] {e}")

    return StreamingResponse(ndjson_gen(), media_type="application/x-ndjson")

def _delta(text: str) -> str:
    return json.dumps({"type":"delta","content":text}, ensure_ascii=False) + "\n"
def _done() -> str:
    return json.dumps({"type":"done"}) + "\n"

# ===== OpenAI =====
async def stream_openai(conv, model, system):
    url = f"{OPENAI_BASE}/chat/completions"
    headers = {"Authorization": f"Bearer {OPENAI_API_KEY}", "Content-Type":"application/json"}
    msgs = ([{"role":"system","content":system}] if system else []) + conv
    payload = {"model": model, "messages": msgs, "temperature": TEMPERATURE, "stream": True}
    async with httpx.AsyncClient(timeout=None) as client:
        async with client.stream("POST", url, headers=headers, json=payload) as r:
            async for line in r.aiter_lines():
                if not line or not line.startswith("data:"): continue
                data = line[5:].strip()
                if data == "[DONE]": break
                try:
                    obj = json.loads(data)
                    delta = obj["choices"][0]["delta"].get("content")
                    if delta: yield _delta(delta)
                except: pass

# ===== Anthropic (v1/messages stream SSE) =====
async def stream_anthropic(conv, model, system):
    url = "https://api.anthropic.com/v1/messages"
    headers = {
        "x-api-key": ANTHROPIC_API_KEY,
        "content-type":"application/json",
        "anthropic-version": ANTHROPIC_VERSION
    }
    contents = []
    if system:
        contents.append({"role":"user","content":[{"type":"text","text":f"[system]\n{system}"}]})
    for m in conv:
        role = "user" if m["role"]=="user" else "assistant"
        contents.append({"role": role, "content":[{"type":"text","text": m["content"]}]})
    payload = {"model": model, "max_tokens": MAX_TOKENS, "temperature": TEMPERATURE, "stream": True, "messages": contents}
    async with httpx.AsyncClient(timeout=None) as client:
        async with client.stream("POST", url, headers=headers, json=payload) as r:
            async for line in r.aiter_lines():
                if not line or not line.startswith("data:"): continue
                data = line[5:].strip()
                if data == "[DONE]": break
                try:
                    evt = json.loads(data)
                    # buscamos eventos con delta de texto
                    delta = evt.get("delta") or evt.get("content_block") or {}
                    text = None
                    # formato común: {"type":"content_block_delta","delta":{"type":"text_delta","text":"..."}}
                    if isinstance(delta, dict):
                        inner = delta.get("text") or delta.get("delta", {}).get("text")
                        text = inner
                    if not text and "message" in evt:
                        # fallback de eventos message
                        parts = evt["message"].get("content", [])
                        for p in parts:
                            if p.get("type")=="text" and p.get("text"):
                                yield _delta(p["text"])
                        continue
                    if text: yield _delta(text)
                except: pass

# ===== Mistral (OpenAI-like SSE) =====
async def stream_mistral(conv, model, system):
    url = f"{MISTRAL_BASE}/chat/completions"
    headers = {"Authorization": f"Bearer {MISTRAL_API_KEY}", "Content-Type":"application/json"}
    msgs = ([{"role":"system","content":system}] if system else []) + conv
    payload = {"model": model, "messages": msgs, "temperature": TEMPERATURE, "stream": True}
    async with httpx.AsyncClient(timeout=None) as client:
        async with client.stream("POST", url, headers=headers, json=payload) as r:
            async for line in r.aiter_lines():
                if not line or not line.startswith("data:"): continue
                data = line[5:].strip()
                if data == "[DONE]": break
                try:
                    obj = json.loads(data)
                    delta = obj["choices"][0]["delta"].get("content")
                    if delta: yield _delta(delta)
                except: pass

# ===== Google Gemini (AI Studio SSE) =====
def _to_gemini_contents(conv, system):
    items = []
    if system:
        items.append({"role":"user","parts":[{"text": f"[system]\n{system}"}]})
    for m in conv:
        role = "user" if m["role"]=="user" else "model"
        items.append({"role": role, "parts":[{"text": m["content"]}]})
    return items

async def stream_gemini(conv, model, system):
    url = f"{GEMINI_BASE}/models/{model}:streamGenerateContent?alt=sse&key={GEMINI_API_KEY}"
    payload = {"contents": _to_gemini_contents(conv, system), "generationConfig": {"temperature": TEMPERATURE}}
    async with httpx.AsyncClient(timeout=None) as client:
        async with client.stream("POST", url, headers={"Content-Type":"application/json"}, json=payload) as r:
            async for line in r.aiter_lines():
                if not line or not line.startswith("data:"): continue
                data = line[5:].strip()
                if data == "[DONE]": break
                try:
                    obj = json.loads(data)
                    cands = obj.get("candidates") or []
                    if cands:
                        parts = cands[0].get("content",{}).get("parts",[])
                        for p in parts:
                            txt = p.get("text")
                            if txt: yield _delta(txt)
                except: pass
