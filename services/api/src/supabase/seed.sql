-- Crea filas de profile para usuarios existentes (en local)
insert into public.profile (id, name, email_verified)
select id, raw_user_meta_data->>'name', email_confirmed_at is not null
from auth.users
on conflict (id) do nothing;
