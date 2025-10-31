from typing import Protocol, Dict, Any, List

class AnalyticsBackend(Protocol):
    def predict_outcome(self, context: Dict[str, Any], message: str) -> Dict[str, Any]:
        ...

    def describe_text(self, text_samples: List[str], features: List[str]) -> Dict[str, Any]:
        ...
