# services/api/app/main.py
from contextlib import asynccontextmanager
from typing import List
import logging

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError

from .settings import get_settings
from .routers import health, chat, abtest, progress

# Routers opcionales (no rompen si faltan)
try:
    from .routers import llm
    HAS_LLM = True
except Exception:
    HAS_LLM = False
    llm = None  # type: ignore

try:
    from .routers import chat_stream
    HAS_STREAM = True
except Exception:
    HAS_STREAM = False
    chat_stream = None  # type: ignore

# Agente específico de ChatMig (opcional, pero recomendado)
try:
    from .routes.agent_chatmig import router as agent_chatmig_router
    HAS_CHATMIG_AGENT = True
except Exception:
    HAS_CHATMIG_AGENT = False
    agent_chatmig_router = None  # type: ignore

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("chatmig")

tags_metadata = [
    {"name": "chat", "description": "Planificación y guiones de mensajes"},
    {"name": "abtest", "description": "Pruebas A/B y métricas"},
    {"name": "progress", "description": "Progreso y hábitos"},
    {"name": "health", "description": "Checks de salud del servicio"},
    {"name": "llm", "description": "Respuestas largas con recuperación de contexto (RAG)"},
    {"name": "agent_chatmig", "description": "Agente IA específico de ChatMig"},
]

# Lifespan: inicializa/cierra recursos
@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    app.state.settings = settings
    logger.info("[ChatMig] API arrancando · modelo=%s", settings.OPENAI_MODEL)
    try:
        yield
    finally:
        logger.info("[ChatMig] API detenido")

app = FastAPI(
    title="ChatMig API",
    version="1.1.0",
    openapi_tags=tags_metadata,
    lifespan=lifespan,
)

# Middlewares
app.add_middleware(GZipMiddleware, minimum_size=800)

settings = get_settings()
allow_origins: List[str] = settings.ALLOWED_ORIGINS or []
app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins if allow_origins else ["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Rutas básicas
@app.get("/", tags=["health"])
async def root():
    return {"status": "ok", "service": "ChatMig API", "version": "1.1.0"}

# Routers
app.include_router(health.router)
app.include_router(chat.router)                 # /chat (plan, etc.)
if HAS_STREAM:
    app.include_router(chat_stream.router)      # /chat/complete_stream (stream texto)
else:
    logger.warning("[ChatMig] Router chat_stream no disponible (saltando /chat/complete_stream)")
if HAS_LLM:
    app.include_router(llm.router)              # /llm (JSON y NDJSON stream)
else:
    logger.warning("[ChatMig] Router LLM no disponible (saltando /llm)")
if HAS_CHATMIG_AGENT:
    # Si tu router NO define prefix/tags, puedes forzarlos aquí:
    # app.include_router(agent_chatmig_router, prefix="/agent/chatmig", tags=["agent_chatmig"])
    app.include_router(agent_chatmig_router)
else:
    logger.warning("[ChatMig] Router agent_chatmig no disponible (saltando /agent/chatmig)")

app.include_router(abtest.router)
app.include_router(progress.router)

# Handlers de error
@app.exception_handler(HTTPException)
async def http_exception_handler(_: Request, exc: HTTPException):
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_: Request, exc: RequestValidationError):
    return JSONResponse(status_code=422, content={"detail": exc.errors()})

@app.exception_handler(Exception)
async def unhandled_exception_handler(_: Request, exc: Exception):
    logger.exception("Error no controlado: %s", exc)
    return JSONResponse(status_code=500, content={"detail": "Internal Server Error"})
