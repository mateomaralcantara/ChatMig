import yaml, re
from pathlib import Path

RULES = yaml.safe_load(Path(__file__).with_name("rules.yaml").read_text(encoding="utf-8"))

def check(text: str) -> list[str]:
    t = text.lower()
    issues = []
    for intent in RULES.get("banned_intents", []):
        if intent in t:
            issues.append(f"rojo:intento prohibido:{intent}")
    qm = t.count("?")
    em = t.count("!")
    if qm > RULES["max_message_marks"]["question_marks"]:
        issues.append("amarillo:demasiadas preguntas → ansiedad")
    if em > RULES["max_message_marks"]["exclamation_marks"]:
        issues.append("amarillo:exceso de énfasis")
    return issues
