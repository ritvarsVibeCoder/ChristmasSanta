-- Secret Santa schema.
-- Tables are locked down (RLS on, no policies, no grants). All access from the
-- browser goes through SECURITY DEFINER functions that require a secret token:
--   * admin_token  -> the organizer's link (sees who opened/revealed, never who drew whom)
--   * token        -> each participant's magic link (sees only their own match)

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.events (
  id           uuid primary key default gen_random_uuid(),
  admin_token  text not null unique,
  name         text not null check (char_length(name) between 1 and 80),
  budget_min   integer not null check (budget_min between 0 and 10000),
  budget_max   integer not null check (budget_max between 0 and 10000),
  created_at   timestamptz not null default now(),
  drawn_at     timestamptz,
  check (budget_min <= budget_max)
);

create table public.participants (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references public.events(id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 40),
  token        text not null unique,
  receiver_id  uuid references public.participants(id) on delete set null,
  sort_order   integer not null,
  opened_at    timestamptz,
  revealed_at  timestamptz,
  created_at   timestamptz not null default now()
);

create index participants_event_id_idx on public.participants(event_id);
create index participants_receiver_id_idx on public.participants(receiver_id);
create unique index participants_event_name_uniq on public.participants(event_id, lower(name));

alter table public.events enable row level security;
alter table public.participants enable row level security;
revoke all on public.events, public.participants from anon, authenticated;

-- 96-bit random, URL-safe token (16 chars).
create function private.new_token()
returns text
language sql
volatile
set search_path = ''
as $$
  select translate(encode(extensions.gen_random_bytes(12), 'base64'), '+/', '-_');
$$;

-- Assign receivers as one random cycle: nobody draws themselves and
-- everyone gives and receives exactly one gift.
create function private.draw(p_event_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  with shuffled as (
    select id,
           row_number() over (order by extensions.gen_random_uuid()) as rn,
           count(*) over () as n
    from public.participants
    where event_id = p_event_id
  )
  update public.participants p
     set receiver_id = s2.id,
         opened_at = null,
         revealed_at = null
    from shuffled s1
    join shuffled s2 on s2.rn = (s1.rn % s1.n) + 1
   where p.id = s1.id;

  update public.events set drawn_at = now() where id = p_event_id;
end;
$$;

create function private.admin_view(p_event_id uuid)
returns json
language sql
stable
set search_path = ''
as $$
  select json_build_object(
    'name', e.name,
    'budget_min', e.budget_min,
    'budget_max', e.budget_max,
    'admin_token', e.admin_token,
    'created_at', e.created_at,
    'drawn_at', e.drawn_at,
    'participants', coalesce((
      select json_agg(json_build_object(
               'name', p.name,
               'token', p.token,
               'opened_at', p.opened_at,
               'revealed_at', p.revealed_at
             ) order by p.sort_order)
      from public.participants p
      where p.event_id = e.id
    ), '[]'::json)
  )
  from public.events e
  where e.id = p_event_id;
$$;

-- Organizer: create an event and draw names in one go.
create function public.create_event(
  p_name text,
  p_budget_min integer,
  p_budget_max integer,
  p_names text[]
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_names text[];
  v_event_id uuid;
  i integer;
begin
  select array_agg(n order by ord)
    into v_names
    from (
      select btrim(x) as n, min(ord) as ord
      from unnest(p_names) with ordinality as t(x, ord)
      where btrim(coalesce(x, '')) <> ''
      group by btrim(x)
    ) s;

  if v_names is null or array_length(v_names, 1) < 3 then
    raise exception 'Add at least 3 people to the draw.' using errcode = '22023';
  end if;
  if array_length(v_names, 1) > 50 then
    raise exception 'A draw can have at most 50 people.' using errcode = '22023';
  end if;
  if (select count(distinct lower(n)) from unnest(v_names) n) <> array_length(v_names, 1) then
    raise exception 'Each person needs a different name.' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(v_names) n where char_length(n) > 40) then
    raise exception 'Names can be at most 40 characters.' using errcode = '22023';
  end if;
  if btrim(coalesce(p_name, '')) = '' then
    raise exception 'Give the event a name.' using errcode = '22023';
  end if;
  if p_budget_min is null or p_budget_max is null or p_budget_min < 0 or p_budget_min > p_budget_max then
    raise exception 'Check the budget: the minimum must not be above the maximum.' using errcode = '22023';
  end if;

  insert into public.events (admin_token, name, budget_min, budget_max)
  values (private.new_token(), btrim(p_name), p_budget_min, p_budget_max)
  returning id into v_event_id;

  for i in 1 .. array_length(v_names, 1) loop
    insert into public.participants (event_id, name, token, sort_order)
    values (v_event_id, v_names[i], private.new_token(), i);
  end loop;

  perform private.draw(v_event_id);

  return private.admin_view(v_event_id);
end;
$$;

-- Organizer: load the dashboard.
create function public.get_event_admin(p_admin_token text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id uuid;
begin
  select id into v_event_id from public.events where admin_token = p_admin_token;
  if v_event_id is null then
    raise exception 'This organizer link is not valid.' using errcode = 'P0002';
  end if;
  return private.admin_view(v_event_id);
end;
$$;

-- Organizer: redraw everyone. Links stay the same; reveals are reset.
create function public.redraw_event(p_admin_token text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id uuid;
begin
  select id into v_event_id from public.events where admin_token = p_admin_token;
  if v_event_id is null then
    raise exception 'This organizer link is not valid.' using errcode = 'P0002';
  end if;
  perform private.draw(v_event_id);
  return private.admin_view(v_event_id);
end;
$$;

-- Participant: open their card. Marks it opened; returns the match only if
-- it was already revealed.
create function public.open_card(p_token text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_p public.participants;
  v_e public.events;
  v_receiver text;
  v_count integer;
begin
  select * into v_p from public.participants where token = p_token;
  if v_p.id is null then
    raise exception 'This link is not valid.' using errcode = 'P0002';
  end if;
  select * into v_e from public.events where id = v_p.event_id;

  update public.participants
     set opened_at = coalesce(opened_at, now())
   where id = v_p.id;

  if v_p.revealed_at is not null then
    select name into v_receiver from public.participants where id = v_p.receiver_id;
  end if;

  select count(*) into v_count from public.participants where event_id = v_e.id;

  return json_build_object(
    'event_name', v_e.name,
    'budget_min', v_e.budget_min,
    'budget_max', v_e.budget_max,
    'participant_count', v_count,
    'my_name', v_p.name,
    'revealed', v_p.revealed_at is not null,
    'receiver_name', v_receiver
  );
end;
$$;

-- Participant: scratch the card. Marks it revealed and returns the match.
create function public.reveal_card(p_token text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_p public.participants;
  v_receiver text;
begin
  select * into v_p from public.participants where token = p_token;
  if v_p.id is null then
    raise exception 'This link is not valid.' using errcode = 'P0002';
  end if;

  update public.participants
     set opened_at = coalesce(opened_at, now()),
         revealed_at = coalesce(revealed_at, now())
   where id = v_p.id;

  select name into v_receiver from public.participants where id = v_p.receiver_id;
  return json_build_object('receiver_name', v_receiver);
end;
$$;

revoke all on function private.new_token(), private.draw(uuid), private.admin_view(uuid) from public, anon, authenticated;
revoke all on function public.create_event(text, integer, integer, text[]),
                       public.get_event_admin(text),
                       public.redraw_event(text),
                       public.open_card(text),
                       public.reveal_card(text) from public;
grant execute on function public.create_event(text, integer, integer, text[]),
                          public.get_event_admin(text),
                          public.redraw_event(text),
                          public.open_card(text),
                          public.reveal_card(text) to anon, authenticated;
