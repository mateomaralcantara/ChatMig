# services/api/payments/paypal.py
from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel
import os, time, json
import httpx

# === ENV ===
ENV = (os.getenv("PAYPAL_ENV") or "sandbox").lower()
BASE = "https://api-m.paypal.com" if ENV == "live" else "https://api-m.sandbox.paypal.com"
CID  = os.getenv("PAYPAL_CLIENT_ID", "")
SEC  = os.getenv("PAYPAL_CLIENT_SECRET", "")
WEBHOOK_ID = os.getenv("PAYPAL_WEBHOOK_ID", "")

# === Supabase (service role) ===
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE", "")  # SECRETO

router = APIRouter(prefix="/paypal", tags=["paypal"])

# Cache simple de access_token
_token_cache = {"value": None, "exp": 0}

async def get_token():
    now = time.time()
    if _token_cache["value"] and now < _token_cache["exp"]:
        return _token_cache["value"]
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.post(
            f"{BASE}/v1/oauth2/token",
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            data="grant_type=client_credentials",
            auth=(CID, SEC),
        )
        if r.status_code != 200:
            raise HTTPException(502, f"OAuth PayPal fallo: {r.text}")
        data = r.json()
        _token_cache["value"] = data["access_token"]
        _token_cache["exp"] = now + int(data.get("expires_in", 300)) - 30
        return _token_cache["value"]

# === Modelos de entrada ===
class CreateOrderIn(BaseModel):
    amount: str  # "5.00"
    currency: str = "USD"
    intent: str = "capture"  # "capture" | "authorize"
    description: str | None = "Pago ChatMig"

class CaptureIn(BaseModel):
    orderID: str

# === Helpers Supabase ===
async def insert_payment(row: dict):
    if not (SUPABASE_URL and SUPABASE_KEY):
        return  # si no hay credenciales, solo omite persistencia
    async with httpx.AsyncClient(timeout=20) as client:
        url = f"{SUPABASE_URL}/rest/v1/payments"
        h = {
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        }
        r = await client.post(url, headers=h, content=json.dumps(row))
        # No levantamos error si falla DB; puedes loguear:
        if r.status_code not in (200, 201, 204):
            print("WARN insert_payment:", r.status_code, r.text)

# === ENDPOINTS ===

@router.post("/create")
async def create_order(body: CreateOrderIn):
    token = await get_token()
    intent = (body.intent or "capture").lower()  # PayPal acepta lower en SDK
    payload = {
        "intent": intent.upper(),  # API espera MAYÚSCULAS
        "purchase_units": [{
            "amount": {"currency_code": body.currency, "value": body.amount},
            "description": body.description or "Pago ChatMig",
        }],
        # Opcional si usaras aprobaciones por redirect (no Smart Buttons)
        # "application_context": {"return_url": "...", "cancel_url": "..."}
    }
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.post(
            f"{BASE}/v2/checkout/orders",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            content=json.dumps(payload),
        )
    if r.status_code not in (200, 201):
        raise HTTPException(400, f"create_order fallo: {r.text}")
    data = r.json()
    # Guarda “intención de pago” si quieres (no obligatorio)
    await insert_payment({
        "provider": "paypal",
        "order_id": data["id"],
        "status": data.get("status"),
        "amount": body.amount,
        "currency": body.currency,
        "raw": data,
    })
    return {"id": data["id"]}

@router.post("/capture")
async def capture_order(body: CaptureIn):
    token = await get_token()
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(
            f"{BASE}/v2/checkout/orders/{body.orderID}/capture",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
        )
    if r.status_code not in (200, 201):
        raise HTTPException(400, f"capture fallo: {r.text}")
    data = r.json()

    # Datos útiles
    status = data.get("status")
    pu = (data.get("purchase_units") or [{}])[0]
    amount = ((pu.get("amount") or {}).get("value")) or None
    currency = ((pu.get("amount") or {}).get("currency_code")) or None
    caps = (((pu.get("payments") or {}).get("captures")) or [])
    capture_id = caps[0].get("id") if caps else None
    payer = data.get("payer") or {}
    payer_name = " ".join(filter(None, [(payer.get("name") or {}).get("given_name"), (payer.get("name") or {}).get("surname")])).strip()

    await insert_payment({
        "provider": "paypal",
        "order_id": data["id"],
        "capture_id": capture_id,
        "status": status,
        "amount": amount,
        "currency": currency,
        "payer_id": payer.get("payer_id"),
        "payer_email": payer.get("email_address"),
        "payer_name": payer_name or None,
        "raw": data,
    })

    return data

# === Webhook opcional: verificación con verify-webhook-signature ===
@router.post("/webhook")
async def webhook(request: Request):
    token = await get_token()
    headers = request.headers
    try:
        body_bytes = await request.body()
        body_str = body_bytes.decode("utf-8")
        event = json.loads(body_str)
    except Exception:
        raise HTTPException(400, "payload inválido")

    # Verifica firma
    verify_payload = {
        "transmission_id": headers.get("paypal-transmission-id"),
        "transmission_time": headers.get("paypal-transmission-time"),
        "cert_url": headers.get("paypal-cert-url"),
        "auth_algo": headers.get("paypal-auth-algo"),
        "transmission_sig": headers.get("paypal-transmission-sig"),
        "webhook_id": WEBHOOK_ID,
        "webhook_event": event,
    }
    async with httpx.AsyncClient(timeout=20) as client:
        vr = await client.post(
            f"{BASE}/v1/notifications/verify-webhook-signature",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            content=json.dumps(verify_payload),
        )
    if vr.status_code != 200 or vr.json().get("verification_status") != "SUCCESS":
        raise HTTPException(400, f"firma webhook inválida: {vr.text}")

    # Manejo básico de eventos útiles
    et = event.get("event_type")
    resource = event.get("resource") or {}

    if et in ("PAYMENT.CAPTURE.COMPLETED", "CHECKOUT.ORDER.APPROVED", "CHECKOUT.ORDER.COMPLETED"):
        order_id = (resource.get("supplementary_data") or {}).get("related_ids", {}).get("order_id") or resource.get("id")
        capture_id = resource.get("id") if "CAPTURE" in (resource.get("status") or "") or "capture" in (resource.get("intent") or "").lower() else None
        amount = (resource.get("amount") or {}).get("value")
        currency = (resource.get("amount") or {}).get("currency_code") or (resource.get("purchase_units") or [{}])[0].get("amount", {}).get("currency_code")
        status = resource.get("status") or event.get("summary")

        await insert_payment({
            "provider": "paypal",
            "order_id": order_id,
            "capture_id": capture_id,
            "status": status,
            "amount": amount,
            "currency": currency,
            "raw": event,
        })

    return {"ok": True}

# --- SUSCRIPCIONES / PLANES ---

from fastapi import Body

# Tabla subscriptions en Supabase (ver SQL abajo)
async def insert_subscription(row: dict):
    if not (SUPABASE_URL and SUPABASE_KEY):
        return
    async with httpx.AsyncClient(timeout=20) as client:
        url = f"{SUPABASE_URL}/rest/v1/subscriptions"
        h = {
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        }
        r = await client.post(url, headers=h, content=json.dumps(row))
        if r.status_code not in (200, 201, 204):
            print("WARN insert_subscription:", r.status_code, r.text)

@router.post("/subs/create-product")
async def create_product(name: str = Body(...), description: str | None = Body(None)):
    token = await get_token()
    payload = {"name": name, "type": "SERVICE"}
    if description: payload["description"] = description
    async with httpx.AsyncClient(timeout=20) as client:
      r = await client.post(
        f"{BASE}/v1/catalogs/products",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        content=json.dumps(payload),
      )
    if r.status_code not in (200, 201):
        raise HTTPException(400, r.text)
    return r.json()

@router.post("/subs/create-plan")
async def create_plan(
    product_id: str = Body(...),
    name: str = Body("Plan mensual"),
    price: str = Body("5.00"),
    currency: str = Body("USD"),
    interval_unit: str = Body("MONTH"),
    interval_count: int = Body(1),
):
    token = await get_token()
    payload = {
        "product_id": product_id,
        "name": name,
        "status": "ACTIVE",
        "billing_cycles": [{
            "frequency": {"interval_unit": interval_unit, "interval_count": interval_count},
            "tenure_type": "REGULAR",
            "sequence": 1,
            "total_cycles": 0,  # 0 = infinito
            "pricing_scheme": {"fixed_price": {"value": price, "currency_code": currency}},
        }],
        "payment_preferences": {"auto_bill_outstanding": True, "setup_fee_failure_action": "CONTINUE"},
    }
    async with httpx.AsyncClient(timeout=20) as client:
      r = await client.post(
        f"{BASE}/v1/billing/plans",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        content=json.dumps(payload),
      )
    if r.status_code not in (200, 201):
        raise HTTPException(400, r.text)
    return r.json()

@router.post("/subscriptions/verify")
async def verify_subscription(subscriptionID: str = Body(..., embed=True)):
    token = await get_token()
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.get(
            f"{BASE}/v1/billing/subscriptions/{subscriptionID}",
            headers={"Authorization": f"Bearer {token}"},
        )
    if r.status_code != 200:
        raise HTTPException(400, f"verify subs fallo: {r.text}")
    data = r.json()
    payer = data.get("subscriber", {}).get("name", {})
    payer_name = " ".join(filter(None, [payer.get("given_name"), payer.get("surname")])).strip() or None

    await insert_subscription({
        "provider": "paypal",
        "subscription_id": data.get("id"),
        "plan_id": (data.get("plan_id")),
        "status": data.get("status"),
        "start_time": data.get("start_time"),
        "next_billing_time": (data.get("billing_info") or {}).get("next_billing_time"),
        "payer_email": (data.get("subscriber") or {}).get("email_address"),
        "payer_id": (data.get("subscriber") or {}).get("payer_id"),
        "payer_name": payer_name,
        "raw": data,
    })
    return data

@router.post("/subscriptions/{subscription_id}/cancel")
async def cancel_subscription(subscription_id: str, reason: str = Body("BY_MERCHANT", embed=True)):
    token = await get_token()
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.post(
            f"{BASE}/v1/billing/subscriptions/{subscription_id}/cancel",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            content=json.dumps({"reason": reason}),
        )
    if r.status_code not in (204, 200):
        raise HTTPException(400, f"cancel fallo: {r.text}")
    return {"ok": True}
