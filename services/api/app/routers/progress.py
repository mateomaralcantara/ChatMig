from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from ..db import get_db, Base, engine
from ..models import ProgressLog
from ..schemas import ProgressLogRequest

router = APIRouter()

# Crear tablas si no existen (simple para demo)
Base.metadata.create_all(bind=engine)

@router.post("/log")
def log_progress(req: ProgressLogRequest, db: Session = Depends(get_db)):
    entry = ProgressLog(kpi=req.kpi, note=req.note or "")
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return {"ok": True, "id": entry.id}
