// api/paypal/subscription-[id].ts
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
  if (req.method !== "GET") return new Response("Method Not Allowed", { status: 405 });

  const url = new URL(req.url);
  const id = url.pathname.split("subscription-")[1]; // /api/paypal/subscription-<ID>

  try {
    const { access_token } = await getAccessToken();
    const resp = await fetch(`${BASE}/v1/billing/subscriptions/${id}`, {
      headers: { Authorization: `Bearer ${access_token}` }
    });
    const data = await resp.json();
    return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || "server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
