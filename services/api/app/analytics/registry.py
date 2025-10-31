import os
from typing import Dict, Any, List
from .interface import AnalyticsBackend

_BACKENDS: Dict[str, AnalyticsBackend] = {}

def register(name: str, backend: AnalyticsBackend):
    _BACKENDS[name] = backend

def get_backend():
    name = os.getenv("ANALYTICS_DEFAULT_BACKEND", "sklearn")
    return _BACKENDS.get(name, _BACKENDS.get("sklearn"))
