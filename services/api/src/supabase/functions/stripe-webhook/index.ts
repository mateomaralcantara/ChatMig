import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@12.18.0?target=deno";

function env(name: string, fallback?: string) { const v = Deno.env.get(name); if (!v && fallback === undefined) throw new Error(`Missing env: ${name}`); return v ?? fallback!; }

const SUPABASE_URL = env("SUPABASE_URL");
const SERVICE_ROLE = env("SUPABASE_SERVICE_ROLE_KEY");
const STRIPE_SECRET = env("STRIPE_SECRET");
const WEBHOOK_SECRET = env("STRIPE_WEBHOOK_SECRET");
const PRICE_PRO = env("BILLING_PRICE_PRO");
const PRICE_BUSINESS = env("BILLING_PRICE_BUSINESS");

const stripe = new Stripe(STRIPE_SECRET, { httpClient: Stripe.createFetchHttpClient() });

function tierFromPriceId(priceId: string): "free" | "pro" | "business" {
  if (priceId === PRICE_BUSINESS) return "business";
  if (priceId === PRICE_PRO) return "pro";
  return "free";
}

function quotaForTier(tier: string): number {
  return tier === "business" ? 200000 : tier === "pro" ? 20000 : 2000;
}

serve(async (req) => {
  try {
    const raw = await req.text();
    const sig = req.headers.get("stripe-signature") ?? "";
    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(raw, sig, WEBHOOK_SECRET);
    } catch (e) {
      return new Response(JSON.stringify({ error: `Invalid signature: ${String(e)}` }), { status: 400 });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Guardar auditoría (idempotente)
    try {
      await supabase.from("payment_events").insert({
        stripe_event_id: event.id,
        type: event.type,
        payload: JSON.parse(raw)
      });
    } catch { /* ignore unique errors */ }

    if (event.type === "checkout.session.completed") {
      const sess = event.data.object as Stripe.Checkout.Session;
      const userId = (sess.client_reference_id ?? "") as string;
      const subId = (sess.subscription ?? "") as string;
      const custId = (sess.customer as string) ?? null;

      if (userId && subId) {
        const sub = await stripe.subscriptions.retrieve(subId);
        const priceId = sub.items.data[0]?.price?.id ?? "";
        const tier = tierFromPriceId(priceId);

        await supabase.from("membership").upsert({
          user_id: userId,
          tier,
          active: ["active", "trialing"].includes(sub.status),
          stripe_customer_id: custId ?? undefined,
          stripe_subscription_id: subId,
          daily_token_quota: quotaForTier(tier),
          current_period_end: new Date(sub.current_period_end * 1000).toISOString()
        }, { onConflict: "user_id" });
      }
    }

    if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.created") {
      const sub = event.data.object as Stripe.Subscription;
      const priceId = sub.items.data[0]?.price?.id ?? "";
      const tier = tierFromPriceId(priceId);

      // Buscar por subscription id
      const { data: m } = await supabase.from("membership").select("*").eq("stripe_subscription_id", sub.id).maybeSingle();

      if (m) {
        await supabase.from("membership").update({
          tier,
          active: ["active", "trialing"].includes(sub.status),
          daily_token_quota: quotaForTier(tier),
          current_period_end: new Date(sub.current_period_end * 1000).toISOString()
        }).eq("user_id", m.user_id);
      } else {
        // Si no existe, intentar por customer
        const { data: byCust } = await supabase.from("membership").select("*").eq("stripe_customer_id", sub.customer as string).maybeSingle();
        if (byCust) {
          await supabase.from("membership").update({
            stripe_subscription_id: sub.id,
            tier,
            active: ["active", "trialing"].includes(sub.status),
            daily_token_quota: quotaForTier(tier),
            current_period_end: new Date(sub.current_period_end * 1000).toISOString()
          }).eq("user_id", byCust.user_id);
        }
      }
    }

    if (event.type === "customer.subscription.deleted" || event.type === "invoice.payment_failed") {
      const obj = event.data.object as any;
      const subId: string = (obj.id ?? obj.subscription ?? "");
      if (subId) {
        const { data: m } = await supabase.from("membership").select("*").eq("stripe_subscription_id", subId).maybeSingle();
        if (m) {
          await supabase.from("membership").update({
            active: false,
            tier: "free",
            daily_token_quota: quotaForTier("free")
          }).eq("user_id", m.user_id);
        }
      }
    }

    return new Response(JSON.stringify({ received: true }), { headers: { "content-type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});

