ETHICAL_RULES = [
    "Consentimiento primero y explícito.",
    "Cero manipulación, engaño o presión.",
    "Respeta límites, privacidad y autonomía.",
    "Sin contenido sexual explícito (PG-13).",
    "Si hay señales de riesgo/abuso → prioriza seguridad."
]

def safety_screen(goal: str, message: str | None = None) -> list[str]:
    flags = []
    red = ["acoso", "vigilar", "presionar", "chantaje", "controlar", "hackear", "droga"]
    if any(x in goal.lower() for x in red):
        flags.append("rojo: objetivo plantea coerción/manipulación.")
    if message and len(message) > 0 and message.count("?") > 3:
        flags.append("amarillo: posible ansiedad/urgencia excesiva.")
    return flags
