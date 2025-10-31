# billing.py
import os, stripe, hmac, hashlib, json, datetime as dt
from fastapi import APIRouter, HTTPException, Request
from supabase import create_client, Client

router = APIRouter(prefix="/billing", tags=["billing"])

stripe.api_key = os.environ["STRIPE_SECRET_KEY"]
sb: Client = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE"])

# Helpers
def _user_id(req: Request) -> str:
    # si usas Supabase Auth JWT en headers:
    uid = req.headers.get("x-sb-user-id")
    if not uid:
        raise HTTPException(401, "No user")
    return uid

@router.post("/checkout")
async def create_checkout(req: Request, body: dict):
    uid = _user_id(req)
    plan_id = body.get("plan_id")          # 'pro'
    price_id = body.get("price_id")        # price_xxx

    # Asegurar billing_customer
    bc = sb.table("billing_customers").select("*").eq("user_id", uid).execute().data
    if bc:
        customer = bc[0]["external_customer_id"]
    else:
        customer = stripe.Customer.create(metadata={"user_id": uid})["id"]
        sb.table("billing_customers").insert({
            "user_id": uid, "provider":"stripe", "external_customer_id": customer
        }).execute()

    session = stripe.checkout.Session.create(
        mode="subscription",
        customer=customer,
        line_items=[{"price": price_id, "quantity": 1}],
        allow_promotion_codes=True,
        success_url=os.environ["PUBLIC_SITE_URL"] + "/billing/success",
        cancel_url=os.environ["PUBLIC_SITE_URL"] + "/billing/cancel",
        metadata={"user_id": uid, "plan_id": plan_id}
    )
    return {"url": session.url}

@router.post("/portal")
async def create_portal(req: Request):
    uid = _user_id(req)
    bc = sb.table("billing_customers").select("*").eq("user_id", uid).execute().data
    if not bc:
        raise HTTPException(400, "No billing customer")
    portal = stripe.billing_portal.Session.create(
        customer=bc[0]["external_customer_id"],
        return_url=os.environ["PUBLIC_SITE_URL"] + "/app"
    )
    return {"url": portal.url}

@router.post("/webhook")
async def stripe_webhook(request: Request):
    payload = await request.body()
    sig = request.headers.get("stripe-signature")
    try:
        event = stripe.Webhook.construct_event(payload, sig, os.environ["STRIPE_WEBHOOK_SECRET"])
    except Exception as e:
        raise HTTPException(400, f"Webhook error: {e}")

    typ = event["type"]
    data = event["data"]["object"]

    # Product/Price sync opcional: products/prices -> plan_prices
    if typ in ("price.created", "price.updated"):
        price = data
        if not price.get("recurring"):  # solo subs
            return {"ok": True}
        plan_id = (price.get("product") or "").lower()  # o mapea con metadata
        # upsert de plan (si lo gestionas en Stripe Product)
        sb.table("plans").upsert({
            "id": plan_id, "name": plan_id.upper(), "is_active": True
        }).execute()
        sb.table("plan_prices").upsert({
            "provider":"stripe",
            "external_price_id": price["id"],
            "plan_id": plan_id,
            "currency": price["currency"],
            "unit_amount": price["unit_amount"],
            "interval": price["recurring"]["interval"],
            "is_active": (not price.get("inactive", False))
        }, on_conflict="external_price_id").execute()
        return {"ok": True}

    if typ in ("customer.subscription.created","customer.subscription.updated"):
        sub = data
        customer = sub["customer"]
        # mapear user_id desde billing_customers
        bc = sb.table("billing_customers").select("user_id").eq("external_customer_id", customer).single().execute().data
        if not bc:
            return {"ok": True}  # desconocido
        uid = bc["user_id"]
        plan_id = sub["items"]["data"][0]["price"]["product"].lower()  # o usa metadata/lookup
        status = sub["status"]
        start = dt.datetime.fromtimestamp(sub["current_period_start"], dt.timezone.utc)
        end   = dt.datetime.fromtimestamp(sub["current_period_end"], dt.timezone.utc)

        sb.table("subscriptions").upsert({
            "user_id": uid,
            "plan_id": plan_id,
            "provider": "stripe",
            "external_subscription_id": sub["id"],
            "status": status,
            "current_period_start": start.isoformat(),
            "current_period_end":   end.isoformat(),
            "cancel_at_period_end": sub.get("cancel_at_period_end", False)
        }, on_conflict="external_subscription_id").execute()
        return {"ok": True}

    if typ == "customer.subscription.deleted":
        sub = data
        sb.table("subscriptions").update({"status":"canceled"}).eq("external_subscription_id", sub["id"]).execute()
        return {"ok": True}

    return {"ok": True}

@router.get("/summary")
async def billing_summary(req: Request):
    uid = _user_id(req)
    ent = sb.table("v_entitlements").select("*").eq("user_id", uid).execute().data
    # si no hay sub, puedes devolver FREE por defecto (define plan 'free' en plans)
    if not ent:
        plan = sb.table("plans").select("*").eq("id","free").single().execute().data
        return {
            "plan_id": "free",
            "plan_name": plan["name"] if plan else "Free",
            "quota_messages": plan.get("quota_messages"),
            "quota_tokens": plan.get("quota_tokens"),
            "remaining_messages": plan.get("quota_messages"),
            "remaining_tokens": plan.get("quota_tokens"),
            "model_allowlist": plan.get("model_allowlist") or [],
            "features": plan.get("features") or {}
        }
    return ent[0]
