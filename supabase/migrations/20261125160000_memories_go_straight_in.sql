-- Memories go straight into the calendar: no review step, no text correction.
--  * A saved memory is approved at once and placed on a random empty future day.
--  * The author can edit or delete it until its day opens.
--  * The organizer can still look at, move or remove memories, but doesn't have to.

-- Put one approved, unscheduled memory on a random empty day that hasn't opened yet.
create function private.advent_place_memory(p_memory_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  m public.advent_memories;
  v_today integer;
  v_day integer;
begin
  select * into m from public.advent_memories where id = p_memory_id;
  if m.id is null or m.day is not null or m.status <> 'approved' then return; end if;
  v_today := private.advent_today(private.advent_cfg(m.event_id));

  select d into v_day
    from generate_series(greatest(v_today + 1, 1), 24) d
   where not exists (select 1 from public.advent_memories x where x.event_id = m.event_id and x.day = d)
   order by extensions.gen_random_uuid()
   limit 1;

  if v_day is not null then
    update public.advent_memories set day = v_day, updated_at = now() where id = p_memory_id;
  end if;
end;
$$;

create or replace function private.advent_my_memories_json(p_participant_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', m.id,
           'question_id', m.question_id,
           'title', q.title,
           'body', m.body,
           'status', m.status,
           'editable', m.status <> 'rejected'
                       and (m.day is null or m.day > coalesce(private.advent_today(s), 0)),
           'created_at', m.created_at
         ) order by m.created_at desc), '[]'::jsonb)
  from public.advent_memories m
  join public.advent_questions q on q.id = m.question_id
  left join public.advent_settings s on s.event_id = m.event_id
  where m.author_id = p_participant_id;
$$;

create or replace function public.advent_save_memory(p_token text, p_id uuid, p_question_id integer, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.participants := private.advent_participant(p_token);
  v_today integer := private.advent_today(private.advent_cfg(p.event_id));
  v_body text := btrim(coalesce(p_body, ''));
  v_n integer;
  v_id uuid;
begin
  if char_length(v_body) < 3 then
    raise exception 'Uzraksti vēl kādu vārdu!' using errcode = '22023';
  end if;
  if char_length(v_body) > 2000 then
    raise exception 'Atmiņa ir par garu (līdz 2000 rakstzīmēm).' using errcode = '22023';
  end if;
  if not exists (select 1 from public.advent_questions where id = p_question_id) then
    raise exception 'Nepareizs jautājums.' using errcode = '22023';
  end if;

  if p_id is null then
    select count(*) into v_n from public.advent_memories where author_id = p.id;
    if v_n >= 40 then
      raise exception 'Paldies — atmiņu ir jau gana daudz!' using errcode = '22023';
    end if;
    insert into public.advent_memories (event_id, author_id, question_id, original_body, body, status, reviewed_at)
    values (p.event_id, p.id, p_question_id, v_body, v_body, 'approved', now())
    returning id into v_id;
    perform private.advent_place_memory(v_id);
  else
    update public.advent_memories
       set body = v_body, original_body = v_body, question_id = p_question_id, updated_at = now()
     where id = p_id and author_id = p.id and status <> 'rejected'
       and (day is null or day > v_today);
    if not found then
      raise exception 'Šo atmiņu vairs nevar labot — tā jau ir atvērta kalendārā.' using errcode = '22023';
    end if;
  end if;

  return private.advent_my_memories_json(p.id);
end;
$$;

create or replace function public.advent_delete_memory(p_token text, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.participants := private.advent_participant(p_token);
  v_today integer := private.advent_today(private.advent_cfg(p.event_id));
begin
  delete from public.advent_memories
   where id = p_id and author_id = p.id
     and (day is null or day > v_today);
  if not found then
    raise exception 'Šo atmiņu vairs nevar izdzēst — tā jau ir atvērta kalendārā.' using errcode = '22023';
  end if;
  return private.advent_my_memories_json(p.id);
end;
$$;

-- When the organizer approves a memory again, place it automatically too.
create or replace function public.advent_admin_review(p_admin_token text, p_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event uuid := private.advent_admin_event(p_admin_token);
  v_today integer := private.advent_today(private.advent_cfg(v_event));
  m public.advent_memories;
begin
  if p_status not in ('approved', 'rejected', 'pending') then
    raise exception 'Nepareizs statuss.' using errcode = '22023';
  end if;
  select * into m from public.advent_memories where id = p_id and event_id = v_event;
  if m.id is null then
    raise exception 'Atmiņa nav atrasta.' using errcode = 'P0002';
  end if;
  if m.day is not null and m.day <= v_today then
    raise exception 'Šī atmiņa jau ir publicēta kalendārā, un to vairs nevar mainīt.' using errcode = '22023';
  end if;

  update public.advent_memories
     set status = p_status,
         day = case when p_status = 'approved' then day else null end,
         reviewed_at = case when p_status = 'pending' then null else now() end,
         updated_at = now()
   where id = p_id;

  if p_status = 'approved' then
    perform private.advent_place_memory(p_id);
  end if;

  return private.advent_admin_json(v_event);
end;
$$;

revoke all on function private.advent_place_memory(uuid) from public, anon, authenticated;

-- Memories already waiting for review: approve and place them now.
do $$
declare r record;
begin
  update public.advent_memories set status = 'approved', reviewed_at = now() where status = 'pending';
  for r in select id from public.advent_memories where status = 'approved' and day is null order by created_at loop
    perform private.advent_place_memory(r.id);
  end loop;
end $$;
