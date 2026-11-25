-- Latvian proofreading of Advent calendar messages (logic unchanged):
-- gender-neutral wording, informal "tu" for the organizer, correct cases.

create or replace function public.advent_guess(p_token text, p_day integer, p_guessed_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.participants := private.advent_participant(p_token);
  cfg public.advent_settings := private.advent_cfg(p.event_id);
  v_today integer := private.advent_today(cfg);
  m public.advent_memories;
begin
  if v_today > 24 then
    raise exception 'Spēle ir noslēgusies — minēt vairs nevar.' using errcode = '22023';
  end if;
  if p_day is null or p_day < 1 or p_day > 24 or p_day > v_today then
    raise exception 'Šīs durvis vēl ir aizvērtas — pacietību!' using errcode = '22023';
  end if;

  select * into m from public.advent_memories where event_id = p.event_id and day = p_day;
  if m.id is null then
    raise exception 'Šai dienai nav atmiņas.' using errcode = '22023';
  end if;
  if m.author_id = p.id then
    raise exception 'Šī ir tava atmiņa — tev nav jāmin.' using errcode = '22023';
  end if;
  if p_guessed_id is null or p_guessed_id = p.id
     or not exists (select 1 from public.participants where id = p_guessed_id and event_id = p.event_id) then
    raise exception 'Izvēlies kādu no ģimenes locekļiem.' using errcode = '22023';
  end if;

  begin
    insert into public.advent_guesses
      (memory_id, event_id, participant_id, guessed_id, day, is_correct, guessed_at, guessed_local_date, on_time)
    values
      (m.id, p.event_id, p.id, p_guessed_id, p_day, p_guessed_id = m.author_id,
       private.advent_now(cfg), private.advent_local_date(cfg), p_day = v_today);
  exception when unique_violation then
    raise exception 'Šai atmiņai minējums jau ir iesniegts — to nevar mainīt.' using errcode = '23505';
  end;

  return private.advent_day_json(p, p_day);
end;
$$;

create or replace function public.advent_admin_edit(p_admin_token text, p_id uuid, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event uuid := private.advent_admin_event(p_admin_token);
  v_today integer := private.advent_today(private.advent_cfg(v_event));
  v_body text := btrim(coalesce(p_body, ''));
  m public.advent_memories;
begin
  if char_length(v_body) < 3 or char_length(v_body) > 2000 then
    raise exception 'Atmiņā jābūt no 3 līdz 2000 rakstzīmēm.' using errcode = '22023';
  end if;
  select * into m from public.advent_memories where id = p_id and event_id = v_event;
  if m.id is null then
    raise exception 'Atmiņa nav atrasta.' using errcode = 'P0002';
  end if;
  if m.day is not null and m.day <= v_today then
    raise exception 'Šī atmiņa jau ir publicēta kalendārā, un to vairs nevar mainīt.' using errcode = '22023';
  end if;
  update public.advent_memories set body = v_body, updated_at = now() where id = p_id;
  return private.advent_admin_json(v_event);
end;
$$;

create or replace function public.advent_admin_assign(p_admin_token text, p_id uuid, p_day integer)
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
  select * into m from public.advent_memories where id = p_id and event_id = v_event;
  if m.id is null then
    raise exception 'Atmiņa nav atrasta.' using errcode = 'P0002';
  end if;
  if m.status <> 'approved' then
    raise exception 'Vispirms apstiprini atmiņu.' using errcode = '22023';
  end if;
  if m.day is not null and m.day <= v_today then
    raise exception 'Šī atmiņa jau ir publicēta kalendārā, un to vairs nevar pārvietot.' using errcode = '22023';
  end if;
  if p_day is not null then
    if p_day < greatest(v_today, 1) or p_day > 24 then
      raise exception 'Pagājušās dienas vairs nevar mainīt — izvēlies šodienu vai kādu no nākamajām dienām.' using errcode = '22023';
    end if;
    if exists (select 1 from public.advent_memories where event_id = v_event and day = p_day and id <> p_id) then
      raise exception 'Šai dienai jau ir atmiņa.' using errcode = '22023';
    end if;
  end if;

  update public.advent_memories set day = p_day, updated_at = now() where id = p_id;
  return private.advent_admin_json(v_event);
end;
$$;

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

  return private.advent_admin_json(v_event);
end;
$$;
