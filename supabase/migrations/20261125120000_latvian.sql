-- Latvian everywhere: Secret Santa error messages (same logic as before) and
-- two new memory questions about family members, shown first.

create or replace function public.create_event(
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
    raise exception 'Pievieno izlozei vismaz 3 cilvēkus.' using errcode = '22023';
  end if;
  if array_length(v_names, 1) > 50 then
    raise exception 'Izlozē var būt ne vairāk kā 50 cilvēku.' using errcode = '22023';
  end if;
  if (select count(distinct lower(n)) from unnest(v_names) n) <> array_length(v_names, 1) then
    raise exception 'Katram cilvēkam jābūt citam vārdam.' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(v_names) n where char_length(n) > 40) then
    raise exception 'Vārds var būt ne garāks par 40 rakstzīmēm.' using errcode = '22023';
  end if;
  if btrim(coalesce(p_name, '')) = '' then
    raise exception 'Ieraksti pasākuma nosaukumu.' using errcode = '22023';
  end if;
  if p_budget_min is null or p_budget_max is null or p_budget_min < 0 or p_budget_min > p_budget_max then
    raise exception 'Pārbaudi budžetu: minimālais nevar būt lielāks par maksimālo.' using errcode = '22023';
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

create or replace function public.get_event_admin(p_admin_token text)
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
    raise exception 'Šī organizatora saite nav derīga.' using errcode = 'P0002';
  end if;
  return private.admin_view(v_event_id);
end;
$$;

create or replace function public.redraw_event(p_admin_token text)
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
    raise exception 'Šī organizatora saite nav derīga.' using errcode = 'P0002';
  end if;
  perform private.draw(v_event_id);
  return private.admin_view(v_event_id);
end;
$$;

create or replace function public.open_card(p_token text)
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
    raise exception 'Šī saite nav derīga.' using errcode = 'P0002';
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

create or replace function public.reveal_card(p_token text)
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
    raise exception 'Šī saite nav derīga.' using errcode = 'P0002';
  end if;

  update public.participants
     set opened_at = coalesce(opened_at, now()),
         revealed_at = coalesce(revealed_at, now())
   where id = v_p.id;

  select name into v_receiver from public.participants where id = v_p.receiver_id;
  return json_build_object('receiver_name', v_receiver);
end;
$$;

-- New questions about family members, listed first; "Cita atmiņa" stays last.
insert into public.advent_questions (id, sort, title, prompt) values
  (11, 1, 'Silta atmiņa par ģimenes locekli', 'Kāda ir tava siltākā atmiņa par kādu no ģimenes locekļiem?'),
  (12, 2, 'Smieklīga atmiņa par ģimenes locekli', 'Kāda ir tava smieklīgākā atmiņa par kādu no ģimenes locekļiem?')
on conflict (id) do nothing;
update public.advent_questions set sort = id + 2 where id between 1 and 9;
update public.advent_questions set sort = 99 where id = 10;
