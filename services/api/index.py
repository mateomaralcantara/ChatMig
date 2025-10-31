# Vercel Python (ASGI). Si tienes FastAPI en app/main.py, se usa. Si no, hay fallback.
try:
    from app.main import app  # tu app FastAPI real
except Exception:
    from fastapi import FastAPI
    app = FastAPI()

    @app.get("/ping")
    def ping():
        return {"ok": True, "msg": "fallback api listo"}
