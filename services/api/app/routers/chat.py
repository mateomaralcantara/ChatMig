# app/routers/chat.py
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import Literal, Optional, Dict, Any
import json
from openai import OpenAI
from app.settings import get_settings

router = APIRouter()
settings = get_settings()
client = OpenAI(api_key=settings.OPENAI_API_KEY)

class StyleConfig(BaseModel):
    persona: str = "coach cálido y ético"
    tone: str = "cálido"
    dialect: str = "es-AR-neutro"
    use_emojis: bool = True
    summary_words: int = 40
    script_words: int = 40
    max_bullets: int = 4
    format: Literal["json","markdown"] = "json"
    temperature: float = 0.6
    max_tokens: int = 400

class PlanInput(BaseModel):
    goal: str
    context: Dict[str, Any] = Field(default_factory=dict)
    message_draft: Optional[str] = None
    style: Optional[StyleConfig] = None
    format: Optional[Literal["json","markdown"]] = None  # override rápido

def build_style() -> StyleConfig:
    try:
        base = json.loads(settings.DEFAULT_STYLE_JSON)
    except Exception:
        base = {}
    return StyleConfig(**base)

def build_system(style: StyleConfig) -> str:
    return f"""
Eres ChatSed, un {style.persona}.
Filosofía: empático, directo, sin manipulación, respeto y consentimiento. Lenguaje claro y breve.
Tono: {style.tone}. Dialecto: {style.dialect}. Emojis: {"pocos y pertinentes" if style.use_emojis else "no usar"}.

FORMATO:
- Si format=json: responde SOLO JSON con llaves: summary (<= {style.summary_words} palabras), steps (lista {style.max_bullets} bullets, cada bullet corto), script (<= {style.script_words} palabras), ab (obj con A y B, 1 línea cada uno), flags (obj con verde/amarillo/rojo), metric_of_the_day, task, p_success (0-1), drivers (lista corta).
- Si format=markdown: Encabezado “Plan”, bullets (máx {style.max_bullets}), “Script”, “A/B” y “Banderas”. Nada de preámbulos innecesarios.

Evita clichés y presión. Sé práctico y amable. No des consejos médicos/legales. 
"""

def build_user(goal: str, ctx: Dict[str, Any], draft: Optional[str], style: StyleConfig, out_format: str) -> str:
    ch = ctx.get("channel","chat")
    draft_txt = f"\nBorrador del usuario: {draft}" if draft else ""
    return f"""Objetivo: {goal}
Canal: {ch}.{draft_txt}

Instrucciones de salida: format={out_format}
"""

@router.post("/plan")
def plan(body: PlanInput):
    # estilo final: defaults + overrides
    base_style = build_style()
    if body.style:
        base_style = StyleConfig(**{**base_style.model_dump(), **body.style.model_dump(exclude_unset=True)})
    if body.format:
        base_style.format = body.format

    system = build_system(base_style)
    user = build_user(body.goal, body.context, body.message_draft, base_style, base_style.format)

    try:
        resp = client.chat.completions.create(
            model=settings.OPENAI_MODEL,
            messages=[
                {"role":"system","content": system},
                {"role":"user","content": user}
            ],
            temperature=base_style.temperature,
            max_tokens=base_style.max_tokens,
        )
        text = resp.choices[0].message.content.strip()

        if base_style.format == "json":
            try:
                data = json.loads(text)
                return data
            except Exception:
                # Fallback: intenta extraer JSON entre llaves
                start = text.find("{")
                end = text.rfind("}")
                if start != -1 and end != -1 and end > start:
                    maybe = text[start:end+1]
                    return json.loads(maybe)
                raise HTTPException(500, detail="LLM no devolvió JSON válido.")
        else:
            # markdown → empaqueta en tu shape habitual
            return {"summary":"", "steps":[], "script":"", "ab":{}, "flags":{}, "metric_of_the_day":"", "task":"", "p_success":0.7, "drivers":[], "markdown": text}
    except HTTPException:
        raise
    except Exception as e:
        # último fallback (tu stub anterior)
        return {
            "summary": f"Plan express para: {body.goal}",
            "steps": [
                "Define tu invitación con día/ventana concreta.",
                "Mensaje breve y amable; acepta sí/no sin presión.",
                "Si no puede, sugiere una alternativa única.",
                "Cierra con ligereza."
            ],
            "script": "Hey, esta semana estaré por tu zona. ¿Te late un café el jue 6pm? Si no te viene, buscamos otra ✨",
            "ab": {"A": "¿Te va un café el jueves 6?", "B": "¿Café este jueves 6pm?"},
            "flags": {"verde":"respeto mutuo", "amarillo":"timing", "rojo":"no presión"},
            "metric_of_the_day": "invitaciones_claras",
            "task": "Enviar 1 invitación antes de las 20:00.",
            "p_success": 0.65,
            "drivers": ["claridad","amabilidad","brevedad"]
        }
