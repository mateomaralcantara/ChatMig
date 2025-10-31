// api/paypal/create-subscription.ts
export const config = { runtime: "nodejs20" };

const BASE = "https://api-m.paypal.com";

async function getAccessToken() {
  const id = process.env.PAYPAL_LIVE_CLIENT_ID!;
  const secret = process.env.PAYPAL_LIVE_SECRET!;
  const auth = Buffer.from(`${id}:${secret}`).toString("base64");

  const res = await fetch(`${BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: "grant_type=client_credentials"
  });
  if (!res.ok) throw new Error("Failed to get access token");
  return res.json() as Promise<{ access_token: string }>;
}

export default async function handler(req: Request) {
  try {
    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const { tier = "pro" } = await req.json().catch(() => ({}));
    const plan =
      tier === "premium"
        ? process.env.PAYPAL_LIVE_PLAN_ID_PREMIUM
        : process.env.PAYPAL_LIVE_PLAN_ID_PRO;

    if (!plan) {
      return new Response(JSON.stringify({ error: "Missing LIVE plan id(s)" }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    const success = process.env.PAYPAL_RETURN_URL!;
    const cancel = process.env.PAYPAL_CANCEL_URL!;
    if (!success || !cancel) {
      return new Response(JSON.stringify({ error: "Missing return/cancel URLs" }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    const { access_token } = await getAccessToken();

    const body = {
      plan_id: plan,
      application_context: {
        brand_name: "ChatMig",
        user_action: "SUBSCRIBE_NOW",
        return_url: success,
        cancel_url: cancel
      }
    };

    const resp = await fetch(`${BASE}/v1/billing/subscriptions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access_token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    const data = await resp.json();
    if (!resp.ok) {
      return new Response(JSON.stringify({ error: data }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Devolver el ID (para PayPal Buttons) y el approve link por si lo quieres abrir directo
    const approve = (data.links || []).find((l: any) => l.rel === "approve")?.href;
    return new Response(JSON.stringify({ id: data.id, approve_url: approve }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || "server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}

