import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@12.18.0?target=deno";

function env(name: string, fallback?: string) { const v = Deno.env.get(name); if (!v && fallback === undefined) throw new Error(`Missing env: ${name}`); return v ?? fallback!; }

const SUPABASE_URL = env("SUPABASE_URL");
const SERVICE_ROLE = env("SUPABASE_SERVICE_ROLE_KEY");
const STRIPE_SECRET = env("STRIPE_SECRET");
const PRICE_PRO = env("BILLING_PRICE_PRO");
const PRICE_BUSINESS = env("BILLING_PRICE_BUSINESS");
const SUCCESS_URL = env("BILLING_SUCCESS_URL");
const CANCEL_URL = env("BILLING_CANCEL_URL");

const stripe = new Stripe(STRIPE_SECRET, { httpClient: Stripe.createFetchHttpClient() });

serve(async (req) => {
  try {
    const { tier } = await req.json().catch(() => ({}));
    if (!tier || !["pro", "business"].includes(tier)) {
      return new Response(JSON.stringify({ error: "Invalid tier" }), { status: 400 });
    }
    const auth = req.headers.get("Authorization");
    if (!auth) return new Response(JSON.stringify({ error: "No auth" }), { status: 401 });

    const supabaseUser = createClient(SUPABASE_URL, SERVICE_ROLE, { global: { headers: { Authorization: auth } } });
    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: { user }, error: uerr } = await supabaseUser.auth.getUser();
    if (uerr || !user) return new Response(JSON.stringify({ error: "Auth failed" }), { status: 401 });

    // Asegurar fila membership
    const { data: mem } = await supabaseAdmin.from("membership").select("*").eq("user_id", user.id).maybeSingle();
    if (!mem) {
      await supabaseAdmin.from("membership").insert({ user_id: user.id, tier: "free", active: false, daily_token_quota: 2000 });
    }

    const price = tier === "pro" ? PRICE_PRO : PRICE_BUSINESS;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price, quantity: 1 }],
      success_url: SUCCESS_URL,
      cancel_url: CANCEL_URL,
      client_reference_id: user.id,
      customer_email: user.email ?? undefined
    });

    return new Response(JSON.stringify({ url: session.url }), { headers: { "content-type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
