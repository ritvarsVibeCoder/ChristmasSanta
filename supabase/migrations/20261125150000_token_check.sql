-- Lets the fix-grammar Edge Function check that a request comes from a family
-- link (participant or organizer token) without reading the tables directly.
-- Returns only true/false; tokens are 96-bit random, so this can't be used to guess them.

create function public.is_family_token(p_token text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.participants where token = p_token)
      or exists (select 1 from public.events where admin_token = p_token);
$$;

revoke all on function public.is_family_token(text) from public;
grant execute on function public.is_family_token(text) to anon, authenticated, service_role;
