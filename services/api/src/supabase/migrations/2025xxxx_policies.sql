-- Activar RLS
alter table public.profile enable row level security;
alter table public.membership enable row level security;
alter table public.usage_counters enable row level security;
alter table public.payment_events enable row level security;

-- PROFILE: dueño puede leer/editar lo suyo
create policy if not exists "profile_select_own"
on public.profile for select
to authenticated
using ( auth.uid() = id );

create policy if not exists "profile_update_own"
on public.profile for update
to authenticated
using ( auth.uid() = id );

-- MEMBERSHIP: sólo leer lo propio (writes via service role)
create policy if not exists "membership_select_own"
on public.membership for select
to authenticated
using ( auth.uid() = user_id );

-- USAGE COUNTERS: leer lo propio
create policy if not exists "usage_select_own"
on public.usage_counters for select
to authenticated
using ( auth.uid() = user_id );

-- (Opcional) permitir insertar/actualizar contadores desde el cliente si querés
-- pero recomendado hacerlo desde Edge Functions con service role.
-- NO policies de insert/update/ delete para membership/usage (lo hace service role).
