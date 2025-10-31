from pydantic import BaseModel, Field
from typing import List, Dict, Optional

class PlanRequest(BaseModel):
    goal: str
    context: Dict[str, str] = {}
    boundaries: Optional[str] = None
    message_draft: Optional[str] = None

class ScriptAB(BaseModel):
    A: str
    B: str
    hypotheses: List[str]
    metrics: List[str]

class PlanResponse(BaseModel):
    summary: str
    flags: Dict[str, str]
    steps: List[str]
    script: str
    ab: Optional[ScriptAB] = None
    metric_of_the_day: str
    task: str
    p_success: Optional[float] = None
    ci_95: Optional[List[float]] = None
    drivers: Optional[List[str]] = None

class EvaluateRequest(BaseModel):
    goal: str
    context: Dict[str, str] = {}
    message: str

class EvaluateResponse(BaseModel):
    goal: str
    works: List[str]
    risks: List[str]
    rewrite: str
    variantB: Optional[str] = None
    hypothesis: Optional[str] = None
    p_success: Optional[float] = None
    ci_95: Optional[List[float]] = None
    drivers: Optional[List[str]] = None

class ABGenRequest(BaseModel):
    goal: str
    constraints: List[str] = ["breve","respetuoso"]
    variants: int = 2

class ABGenResponse(BaseModel):
    A: str
    B: str
    hypotheses: List[str]
    metrics: List[str]

class ProgressLogRequest(BaseModel):
    date: Optional[str] = None
    kpi: Dict[str, float]
    note: Optional[str] = None
