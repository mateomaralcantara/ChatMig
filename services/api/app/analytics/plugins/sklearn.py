from typing import Dict, Any, List

class SklearnBackend:
    def __init__(self):
        # Versión heurística sin dependencias pesadas
        self.model = None

    def predict_outcome(self, context: Dict[str, Any], message: str) -> Dict[str, Any]:
        length = len(message or "")
        polite_words = sum(1 for w in ["por favor","gracias","te late","¿te parece?"] if (message or "").lower().find(w) != -1)
        exclam = (message or "").count("!")
        score = max(0.1, min(0.9, 0.6 + 0.1*polite_words - 0.0007*max(0, length-120) - 0.03*exclam))
        return {
            "p_success": float(round(score, 2)),
            "ci_95": [max(0.0, score-0.08), min(1.0, score+0.08)],
            "top_drivers": ["claridad","amabilidad","brevedad"],
            "risk_flags": []
        }

    def describe_text(self, text_samples: List[str], features: List[str]) -> Dict[str, Any]:
        pos = sum(1 for t in text_samples if "bien" in (t or "").lower())
        sentiment = pos / max(1, len(text_samples))
        return {"n": len(text_samples), "feature_summary": {"sentiment": sentiment, "politeness": 0.7, "empathy": 0.6}, "notes": "heurística"}

def setup():
    from ..registry import register
    register("sklearn", SklearnBackend())
