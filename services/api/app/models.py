from sqlalchemy import Column, Integer, String, DateTime, JSON, Float
from sqlalchemy.sql import func
from .db import Base

class ProgressLog(Base):
    __tablename__ = "progress_logs"
    id = Column(Integer, primary_key=True, index=True)
    date = Column(DateTime(timezone=True), server_default=func.now())
    kpi = Column(JSON, nullable=False)
    note = Column(String, nullable=True)

class ConversationExample(Base):
    __tablename__ = "conversation_examples"
    id = Column(Integer, primary_key=True, index=True)
    channel = Column(String, default="chat")
    relationship_stage = Column(String, default="conociendose")
    message = Column(String, nullable=False)
    label = Column(Integer, default=0)  # 1 si éxito, 0 si no
    p_success = Column(Float, default=0.5)
