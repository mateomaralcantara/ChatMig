import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@12.18.0?target=deno";

function env(name: string, fallback?: string) { const v = Deno.env.get(name); if (!v && fallback === undefined) throw new Error(`Missing env: ${name}`); return v ?? fallback!; }

const SUPABASE_URL = env("SUPABASE_URL");
const SERVICE_ROLE = env("SUPABASE_SERVICE_ROLE_KEY");
const STRIPE_SECRET = env("STRIPE_SECRET");
const RETURN_URL = env("BILLING_RETURN_URL");

const stripe = new Stripe(STRIPE_SECRET, { httpClient: Stripe.createFetchHttpClient() });

serve(async (req) => {
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return new Response(JSON.stringify({ error: "No auth" }), { status: 401 });

    const supabaseUser = createClient(SUPABASE_URL, SERVICE_ROLE, { global: { headers: { Authorization: auth } } });
    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: { user } } = await supabaseUser.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Auth failed" }), { status: 401 });

    let { data: m, error } = await supabaseAdmin.from("membership").select("*").eq("user_id", user.id).single();
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400 });

    let customerId = m.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({ email: user.email ?? undefined, metadata: { user_id: user.id } });
      customerId = customer.id;
      await supabaseAdmin.from("membership").update({ stripe_customer_id: customerId }).eq("user_id", user.id);
    }

    const sess = await stripe.billingPortal.sessions.create({ customer: customerId, return_url: RETURN_URL });
    return new Response(JSON.stringify({ url: sess.url }), { headers: { "content-type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});

