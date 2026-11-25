-- Two attempts per memory.
--  * 1st attempt correct: correct_points (default 7)
--  * 2nd attempt correct: second_try_points (default 4)
--  * The author is revealed after a correct guess or after the 2nd attempt.
--  * Streak: a day counts if the first attempt was made on that calendar day.

alter table public.advent_settings
  add column second_try_points integer not null default 4 check (second_try_points between 0 and 100);

alter table public.advent_guesses
  add column attempt smallint not null default 1 check (attempt in (1, 2));
alter table public.advent_guesses drop constraint advent_guesses_memory_id_participant_id_key;
alter table public.advent_guesses add constraint advent_guesses_attempt_uniq unique (memory_id, participant_id, attempt);
alter table public.advent_guesses add constraint advent_guesses_person_uniq unique (memory_id, participant_id, guessed_id);

create or replace function private.advent_config_json(cfg public.advent_settings)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'year', cfg.year,
    'tz', cfg.tz,
    'correct_points', cfg.correct_points,
    'second_try_points', cfg.second_try_points,
    'streak_bonuses', cfg.streak_bonuses,
    'complete_bonus', cfg.complete_bonus
  );
$$;

create or replace function private.advent_scores(p_event_id uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  cfg public.advent_settings;
  v_today integer;
  p record;
  m record;
  b record;
  d integer;
  v_ontime boolean;
  v_streak integer;
  v_best integer;
  v_bonus integer;
  v_awarded integer[];
  v_ms jsonb;
  v_complete boolean;
  v_counted integer;
  v_correct integer;
  v_points integer;
  v_answered integer;
  v_out jsonb := '[]'::jsonb;
begin
  cfg := private.advent_cfg(p_event_id);
  v_today := private.advent_today(cfg);

  for p in select id, name, sort_order from public.participants where event_id = p_event_id order by sort_order loop
    v_streak := 0; v_best := 0; v_bonus := 0; v_awarded := '{}'; v_ms := '[]'::jsonb;
    v_complete := true; v_counted := 0;

    for d in 1 .. least(v_today, 24) loop
      select id, author_id into m from public.advent_memories where event_id = p_event_id and day = d;
      if not found then continue; end if;
      if m.author_id = p.id then continue; end if;

      select bool_or(on_time) into v_ontime
        from public.advent_guesses where memory_id = m.id and participant_id = p.id;
      if coalesce(v_ontime, false) then
        v_streak := v_streak + 1;
        v_counted := v_counted + 1;
        v_best := greatest(v_best, v_streak);
        for b in
          select (x.value->>'days')::int as days, (x.value->>'points')::int as points
          from jsonb_array_elements(cfg.streak_bonuses) x
          order by 1
        loop
          if v_streak >= b.days and not (b.days = any(v_awarded)) then
            v_awarded := v_awarded || b.days;
            v_bonus := v_bonus + b.points;
            v_ms := v_ms || jsonb_build_object('kind', 'streak', 'days', b.days, 'points', b.points, 'day', d);
          end if;
        end loop;
      elsif d < v_today then
        v_streak := 0;
        v_complete := false;
      else
        v_complete := false;
      end if;
    end loop;

    if v_today >= 24 and v_complete and v_counted > 0 then
      v_bonus := v_bonus + cfg.complete_bonus;
      v_ms := v_ms || jsonb_build_object('kind', 'complete', 'points', cfg.complete_bonus);
    end if;

    select count(*) filter (where is_correct),
           coalesce(sum(case when is_correct then
                          case when attempt = 1 then cfg.correct_points else cfg.second_try_points end
                        else 0 end), 0),
           count(distinct memory_id)
      into v_correct, v_points, v_answered
      from public.advent_guesses where participant_id = p.id;

    v_out := v_out || jsonb_build_object(
      'participant_id', p.id,
      'name', p.name,
      'sort_order', p.sort_order,
      'correct_count', v_correct,
      'answered_count', v_answered,
      'correct_points', v_points,
      'bonus_points', v_bonus,
      'milestones', v_ms,
      'streak', v_streak,
      'best_streak', v_best,
      'total', v_points + v_bonus
    );
  end loop;

  return v_out;
end;
$$;

create or replace function private.advent_day_json(p public.participants, p_day integer)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  cfg public.advent_settings := private.advent_cfg(p.event_id);
  v_today integer := private.advent_today(cfg);
  m public.advent_memories;
  q public.advent_questions;
  v_n integer;
  v_solved boolean;
  v_first record;
  v_last record;
  v_guess jsonb := null;
  v_retry jsonb := null;
  v_options jsonb := null;
  v_own boolean;
begin
  if p_day is null or p_day < 1 or p_day > 24 then
    raise exception 'Nepareiza diena.' using errcode = '22023';
  end if;
  if p_day > v_today then
    raise exception 'Šīs durvis vēl ir aizvērtas — pacietību!' using errcode = '22023';
  end if;

  select * into m from public.advent_memories where event_id = p.event_id and day = p_day;
  if m.id is null then
    return jsonb_build_object('day', p_day, 'today', v_today, 'empty', true);
  end if;
  select * into q from public.advent_questions where id = m.question_id;
  v_own := m.author_id = p.id;

  select count(*), coalesce(bool_or(is_correct), false) into v_n, v_solved
    from public.advent_guesses where memory_id = m.id and participant_id = p.id;
  select g.*, x.name as guessed_name into v_first
    from public.advent_guesses g join public.participants x on x.id = g.guessed_id
   where g.memory_id = m.id and g.participant_id = p.id and g.attempt = 1;
  select g.*, x.name as guessed_name into v_last
    from public.advent_guesses g join public.participants x on x.id = g.guessed_id
   where g.memory_id = m.id and g.participant_id = p.id
   order by g.attempt desc limit 1;

  if v_n > 0 and (v_solved or v_n >= 2 or v_today > 24) then
    v_guess := jsonb_build_object(
      'guessed_name', v_last.guessed_name,
      'first_name', v_first.guessed_name,
      'author_name', (select name from public.participants where id = m.author_id),
      'correct', v_solved,
      'attempt', v_last.attempt,
      'on_time', v_first.on_time,
      'points', case when not v_solved then 0
                     when v_last.attempt = 1 then cfg.correct_points
                     else cfg.second_try_points end
    );
  elsif v_n = 1 then
    v_retry := jsonb_build_object('guessed_name', v_first.guessed_name, 'on_time', v_first.on_time);
  end if;

  if v_guess is null and not v_own and v_today <= 24 then
    select jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name) order by x.sort_order)
      into v_options
      from public.participants x
     where x.event_id = p.event_id and x.id <> p.id
       and x.id is distinct from v_first.guessed_id;
  end if;

  return jsonb_build_object(
    'day', p_day,
    'today', v_today,
    'empty', false,
    'title', q.title,
    'prompt', q.prompt,
    'body', m.body,
    'own', v_own,
    'guess', v_guess,
    'retry', v_retry,
    'attempt', v_n + 1,
    'options', v_options,
    'can_guess', v_options is not null,
    'late', p_day < v_today,
    'game_over', v_today > 24,
    'correct_points', cfg.correct_points,
    'second_try_points', cfg.second_try_points
  );
end;
$$;

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
  v_n integer;
  v_solved boolean;
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

  -- serialize attempts of the same person on the same memory
  perform 1 from public.participants where id = p.id for update;

  select count(*), coalesce(bool_or(is_correct), false) into v_n, v_solved
    from public.advent_guesses where memory_id = m.id and participant_id = p.id;
  if v_solved then
    raise exception 'Tu šo atmiņu jau uzminēji!' using errcode = '22023';
  end if;
  if v_n >= 2 then
    raise exception 'Abi mēģinājumi jau ir izmantoti — minējumus nevar mainīt.' using errcode = '22023';
  end if;
  if exists (select 1 from public.advent_guesses
              where memory_id = m.id and participant_id = p.id and guessed_id = p_guessed_id) then
    raise exception 'Šo cilvēku tu jau minēji — izvēlies kādu citu.' using errcode = '22023';
  end if;

  begin
    insert into public.advent_guesses
      (memory_id, event_id, participant_id, guessed_id, day, is_correct, guessed_at, guessed_local_date, on_time, attempt)
    values
      (m.id, p.event_id, p.id, p_guessed_id, p_day, p_guessed_id = m.author_id,
       private.advent_now(cfg), private.advent_local_date(cfg), p_day = v_today, v_n + 1);
  exception when unique_violation then
    raise exception 'Šis minējums jau ir iesniegts — to nevar mainīt.' using errcode = '23505';
  end;

  return private.advent_day_json(p, p_day);
end;
$$;

create or replace function public.advent_state(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.participants := private.advent_participant(p_token);
  cfg public.advent_settings := private.advent_cfg(p.event_id);
  v_today integer := private.advent_today(cfg);
  v_me jsonb;
begin
  select s into v_me from jsonb_array_elements(private.advent_scores(p.event_id)) s
   where (s->>'participant_id')::uuid = p.id;

  return jsonb_build_object(
    'event_name', (select name from public.events where id = p.event_id),
    'my_name', p.name,
    'today', v_today,
    'local_date', private.advent_local_date(cfg),
    'finale', v_today >= 24,
    'game_over', v_today > 24,
    'config', private.advent_config_json(cfg),
    'questions', private.advent_questions_json(),
    'my_memory_count', (select count(*) from public.advent_memories where author_id = p.id),
    'score', v_me - 'participant_id' - 'sort_order',
    'days', (
      select jsonb_agg(jsonb_build_object(
               'day', d,
               'state', case
                 when d > v_today then 'locked'
                 when m.id is null then 'empty'
                 when m.author_id = p.id then 'own'
                 when coalesce(g.n, 0) = 0 then 'open'
                 when g.ok then 'correct'
                 when g.n >= 2 or v_today > 24 then 'wrong'
                 else 'retry'
               end
             ) order by d)
      from generate_series(1, 24) d
      left join public.advent_memories m on m.event_id = p.event_id and m.day = d and d <= v_today
      left join lateral (
        select count(*) as n, bool_or(x.is_correct) as ok
        from public.advent_guesses x
        where x.memory_id = m.id and x.participant_id = p.id
      ) g on true
    )
  );
end;
$$;

drop function public.advent_admin_settings(text, text, integer, jsonb, integer);

create function public.advent_admin_settings(
  p_admin_token       text,
  p_tz                text,
  p_correct_points    integer,
  p_second_try_points integer,
  p_streak_bonuses    jsonb,
  p_complete_bonus    integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event uuid := private.advent_admin_event(p_admin_token);
  cfg public.advent_settings := private.advent_cfg(v_event);
  v_bonuses jsonb;
  v_n integer;
begin
  if private.advent_today(cfg) >= 1 then
    raise exception 'Iestatījumus var mainīt tikai līdz kalendāra sākumam (1. decembrim).' using errcode = '22023';
  end if;

  if p_tz is null or not exists (select 1 from pg_catalog.pg_timezone_names where name = p_tz) then
    raise exception 'Nezināma laika josla.' using errcode = '22023';
  end if;
  if p_correct_points is null or p_correct_points < 1 or p_correct_points > 100 then
    raise exception 'Punktiem par pareizu atbildi jābūt no 1 līdz 100.' using errcode = '22023';
  end if;
  if p_second_try_points is null or p_second_try_points < 0 or p_second_try_points > p_correct_points then
    raise exception 'Punktiem par otro mēģinājumu jābūt no 0 līdz punktiem par pirmo mēģinājumu.' using errcode = '22023';
  end if;
  if p_complete_bonus is null or p_complete_bonus < 0 or p_complete_bonus > 50 then
    raise exception 'Bonusam par visām dienām jābūt no 0 līdz 50.' using errcode = '22023';
  end if;
  if p_streak_bonuses is null or jsonb_typeof(p_streak_bonuses) <> 'array' or jsonb_array_length(p_streak_bonuses) > 8 then
    raise exception 'Var būt ne vairāk kā 8 sērijas bonusi.' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_streak_bonuses) x
    where jsonb_typeof(x->'days') <> 'number' or jsonb_typeof(x->'points') <> 'number'
       or (x->>'days')::numeric not between 2 and 24 or (x->>'points')::numeric not between 1 and 20
       or (x->>'days')::numeric <> trunc((x->>'days')::numeric)
       or (x->>'points')::numeric <> trunc((x->>'points')::numeric)
  ) then
    raise exception 'Sērijas bonusam: dienas no 2 līdz 24, punkti no 1 līdz 20.' using errcode = '22023';
  end if;

  select count(distinct (x->>'days')::int), coalesce(
           jsonb_agg(jsonb_build_object('days', (x->>'days')::int, 'points', (x->>'points')::int) order by (x->>'days')::int),
           '[]'::jsonb)
    into v_n, v_bonuses
    from jsonb_array_elements(p_streak_bonuses) x;
  if v_n <> jsonb_array_length(p_streak_bonuses) then
    raise exception 'Katram sērijas bonusam jābūt citam dienu skaitam.' using errcode = '22023';
  end if;

  update public.advent_settings
     set tz = p_tz,
         correct_points = p_correct_points,
         second_try_points = p_second_try_points,
         streak_bonuses = v_bonuses,
         complete_bonus = p_complete_bonus
   where event_id = v_event;

  return private.advent_admin_json(v_event);
end;
$$;

revoke all on function public.advent_admin_settings(text, text, integer, integer, jsonb, integer) from public;
grant execute on function public.advent_admin_settings(text, text, integer, integer, jsonb, integer) to anon, authenticated;
