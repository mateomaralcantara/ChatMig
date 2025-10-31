from fastapi import APIRouter
from ..schemas import ABGenRequest, ABGenResponse

router = APIRouter()

@router.post("/generate", response_model=ABGenResponse)
def generate(req: ABGenRequest):
    goal = req.goal
    A = f"{goal.capitalize()} — ¿Te va el jueves 6pm?"
    B = f"{goal.capitalize()} — ¿Probamos café este jueves 6?"
    return {
        "A": A,
        "B": B,
        "hypotheses": ["A más directo","B más lúdico"],
        "metrics": ["respuesta","tiempo_a_respuesta"]
    }
