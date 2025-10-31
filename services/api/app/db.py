from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
import os

# Permite usar DATABASE_URL si está seteada; fallback a SQLite local
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///./chatsed.db")

# Si quieres forzar Postgres más adelante, exporta DATABASE_URL con tu DSN:
# postgresql://user:pass@host:port/dbname

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, pool_pre_ping=True, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
