# main.py
from fastapi import FastAPI
from services.api.payments import paypal

app = FastAPI()
app.include_router(paypal.router, prefix="/api")  # => /api/paypal/...
