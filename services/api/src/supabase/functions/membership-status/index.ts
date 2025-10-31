import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function env(name: string, fallback?: string) {
  const v = Deno.env.get(name);
  if (!v && fallback === undefined) throw new Error(`Missing env: ${name}`);
  return v ?? fallback!;
}

const SUPABASE_URL = env("SUPABASE_URL");
const SERVICE_ROLE = env("SUPABASE_SERVICE_ROLE_KEY");

function quotaForTier(tier: string): number {
  return tier === "business" ? 200000 : tier === "pro" ? 20000 : 2000;
}

serve(async (req) => {
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return new Response(JSON.stringify({ error: "No auth" }), { status: 401 });

    const supabaseUser = createClient(SUPABASE_URL, SERVICE_ROLE, { global: { headers: { Authorization: auth } } });
    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: { user } } = await supabaseUser.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Auth failed" }), { status: 401 });

    const { data: m } = await supabaseAdmin.from("membership").select("*").eq("user_id", user.id).maybeSingle();
    const tier = (m?.tier ?? "free") as "free" | "pro" | "business";
    const active = !!m?.active;
    const periodEnd = m?.current_period_end ?? null;
    const quota = m?.daily_token_quota ?? quotaForTier(tier);

    const today = new Date().toISOString().slice(0,10);
    const { data: uc } = await supabaseAdmin
      .from("usage_counters").select("*")
      .eq("user_id", user.id).eq("day", today).maybeSingle();

    const used = uc?.tokens_used ?? 0;
    const left = Math.max(quota - used, 0);

    return new Response(JSON.stringify({
      tier, active, current_period_end: periodEnd, quota_left: left
    }), { headers: { "content-type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});

