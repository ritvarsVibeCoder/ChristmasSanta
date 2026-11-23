-- Advent calendar & family-memory guessing game.
-- Purely additive: new tables + new token-checked functions. The Secret Santa
-- tables/functions are untouched (only a harmless unique index is added to
-- participants so new tables can reference (id, event_id)).
--
-- Access reuses the existing secret tokens:
--   participants.token  -> participant calendar, memories, guesses, own score
--   events.admin_token  -> organizer moderation & scheduling
-- All scoring happens here; the browser can't write points, streaks or results.

create unique index if not exists participants_id_event_uniq on public.participants(id, event_id);

-- ---------- settings (one row per event, created lazily) ----------
create table public.advent_settings (
  event_id        uuid primary key references public.events(id) on delete cascade,
  year            integer not null check (year between 2020 and 2100),
  tz              text    not null default 'Europe/Riga',
  correct_points  integer not null default 7 check (correct_points between 0 and 100),
  streak_bonuses  jsonb   not null default '[{"days":3,"points":1},{"days":5,"points":1},{"days":7,"points":2},{"days":14,"points":2}]',
  complete_bonus  integer not null default 3 check (complete_bonus between 0 and 100),
  -- Testing only: pretend "now" is this time for this event. Never exposed to the API.
  clock_override  timestamptz,
  created_at      timestamptz not null default now()
);

-- ---------- questions ----------
create table public.advent_questions (
  id     smallint primary key,
  sort   smallint not null,
  title  text not null,   -- short label shown on the calendar
  prompt text not null    -- the question in the questionnaire
);

insert into public.advent_questions (id, sort, title, prompt) values
  (1, 1,  'Smieklīgākā bērnības atmiņa',        'Kāda ir tava smieklīgākā bērnības atmiņa?'),
  (2, 2,  'Mīļākā Ziemassvētku atmiņa',          'Kāda ir tava mīļākā Ziemassvētku atmiņa?'),
  (3, 3,  'Mīļa atmiņa ar mammu',               'Kāda ir tava mīļākā atmiņa ar mammu?'),
  (4, 4,  'Mīļa atmiņa ar tēti',                'Kāda ir tava mīļākā atmiņa ar tēti?'),
  (5, 5,  'Atmiņa ar brāli vai māsu',           'Kāda ir tava mīļākā atmiņa ar brāli vai māsu?'),
  (6, 6,  'Smieklīgākais notikums',             'Kas ir smieklīgākais, kas ar tevi jebkad noticis?'),
  (7, 7,  'Bērnības noslēpums',                 'Ko no tavas bērnības citi ģimenē varbūt nezina?'),
  (8, 8,  'Bērnības sapnis',                    'Kāds bija tavs bērnības sapnis?'),
  (9, 9,  'Neaizmirstams ģimenes brīdis',       'Kāds ir ģimenes brīdis, ko tu nekad neaizmirsīsi?'),
  (10, 10, 'Ģimenes atmiņa',                    'Cita atmiņa — raksti, ko vien vēlies!');

-- ---------- memories ----------
create table public.advent_memories (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references public.events(id) on delete cascade,
  author_id     uuid not null,
  question_id   smallint not null references public.advent_questions(id),
  original_body text not null,
  body          text not null check (char_length(body) between 3 and 2000),
  status        text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  day           smallint check (day between 1 and 24),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  reviewed_at   timestamptz,
  foreign key (author_id, event_id) references public.participants(id, event_id) on delete cascade,
  check (day is null or status = 'approved')
);
create unique index advent_memories_event_day_uniq on public.advent_memories(event_id, day) where day is not null;
create index advent_memories_event_idx on public.advent_memories(event_id);
create index advent_memories_author_idx on public.advent_memories(author_id);

-- ---------- guesses (immutable) ----------
create table public.advent_guesses (
  id                 uuid primary key default gen_random_uuid(),
  memory_id          uuid not null references public.advent_memories(id) on delete cascade,
  event_id           uuid not null,
  participant_id     uuid not null,
  guessed_id         uuid not null,
  day                smallint not null check (day between 1 and 24),
  is_correct         boolean not null,
  guessed_at         timestamptz not null,
  guessed_local_date date not null,
  on_time            boolean not null,   -- submitted on the memory's own calendar day
  unique (memory_id, participant_id),    -- one guess per person per memory
  foreign key (participant_id, event_id) references public.participants(id, event_id) on delete cascade,
  foreign key (guessed_id, event_id) references public.participants(id, event_id) on delete cascade,
  check (participant_id <> guessed_id)
);
create index advent_guesses_participant_idx on public.advent_guesses(participant_id);
create index advent_guesses_event_idx on public.advent_guesses(event_id);
create index advent_guesses_guessed_idx on public.advent_guesses(guessed_id);

create function private.advent_guesses_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Minējumus nevar mainīt.' using errcode = '42501';
end;
$$;
create trigger advent_guesses_no_update before update on public.advent_guesses
  for each row execute function private.advent_guesses_immutable();

alter table public.advent_settings enable row level security;
alter table public.advent_questions enable row level security;
alter table public.advent_memories enable row level security;
alter table public.advent_guesses enable row level security;
revoke all on public.advent_settings, public.advent_questions, public.advent_memories, public.advent_guesses
  from anon, authenticated;

-- ---------- private helpers ----------

create function private.advent_cfg(p_event_id uuid)
returns public.advent_settings
language plpgsql
set search_path = ''
as $$
declare
  r public.advent_settings;
begin
  select * into r from public.advent_settings where event_id = p_event_id;
  if not found then
    insert into public.advent_settings (event_id, year)
    select e.id, extract(year from (e.created_at at time zone 'Europe/Riga'))::int
      from public.events e where e.id = p_event_id
    on conflict (event_id) do nothing;
    select * into r from public.advent_settings where event_id = p_event_id;
  end if;
  return r;
end;
$$;

create function private.advent_now(cfg public.advent_settings)
returns timestamptz
language sql
stable
set search_path = ''
as $$ select coalesce(cfg.clock_override, now()); $$;

create function private.advent_local_date(cfg public.advent_settings)
returns date
language sql
stable
set search_path = ''
as $$ select (private.advent_now(cfg) at time zone cfg.tz)::date; $$;

-- Calendar day number for "today": 1 = 1 December. <1 before December, >24 after Christmas Eve.
create function private.advent_today(cfg public.advent_settings)
returns integer
language sql
stable
set search_path = ''
as $$ select (private.advent_local_date(cfg) - make_date(cfg.year, 12, 1)) + 1; $$;

create function private.advent_participant(p_token text)
returns public.participants
language plpgsql
stable
set search_path = ''
as $$
declare
  r public.participants;
begin
  select * into r from public.participants where token = p_token;
  if r.id is null then
    raise exception 'Šī saite nav derīga.' using errcode = 'P0002';
  end if;
  return r;
end;
$$;

create function private.advent_admin_event(p_admin_token text)
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v uuid;
begin
  select id into v from public.events where admin_token = p_admin_token;
  if v is null then
    raise exception 'Šī organizatora saite nav derīga.' using errcode = 'P0002';
  end if;
  return v;
end;
$$;

-- Scores for every participant of an event, computed from immutable guesses.
--  * correct guess = cfg.correct_points
--  * streak = consecutive scheduled days guessed ON that day; days with no memory
--    and days where the person is the author are neutral (skipped).
--  * a missed past day resets the streak; milestones already earned stay.
--  * "complete" bonus: every scheduled day 1–24 (not own) guessed on time.
create function private.advent_scores(p_event_id uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  cfg public.advent_settings;
  v_today integer;
  p record;
  m record;
  g record;
  b record;
  d integer;
  v_streak integer;
  v_best integer;
  v_bonus integer;
  v_awarded integer[];
  v_ms jsonb;
  v_complete boolean;
  v_counted integer;
  v_correct integer;
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

      select on_time into g from public.advent_guesses where memory_id = m.id and participant_id = p.id;
      if found and g.on_time then
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
        v_streak := 0;          -- missed day: streak broken, earned bonuses stay
        v_complete := false;
      else
        v_complete := false;    -- today, not guessed yet: pending, streak not broken
      end if;
    end loop;

    if v_today >= 24 and v_complete and v_counted > 0 then
      v_bonus := v_bonus + cfg.complete_bonus;
      v_ms := v_ms || jsonb_build_object('kind', 'complete', 'points', cfg.complete_bonus);
    end if;

    select count(*) filter (where is_correct), count(*)
      into v_correct, v_answered
      from public.advent_guesses where participant_id = p.id;

    v_out := v_out || jsonb_build_object(
      'participant_id', p.id,
      'name', p.name,
      'sort_order', p.sort_order,
      'correct_count', v_correct,
      'answered_count', v_answered,
      'correct_points', v_correct * cfg.correct_points,
      'bonus_points', v_bonus,
      'milestones', v_ms,
      'streak', v_streak,
      'best_streak', v_best,
      'total', v_correct * cfg.correct_points + v_bonus
    );
  end loop;

  return v_out;
end;
$$;

create function private.advent_standings(p_event_id uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_scores jsonb := private.advent_scores(p_event_id);
  v_rows jsonb;
  v_top integer;
  v_winners jsonb;
begin
  select coalesce(max((s->>'total')::int), 0) into v_top from jsonb_array_elements(v_scores) s;

  select jsonb_agg(r order by (r->>'rank')::int, r->>'name')
    into v_rows
    from (
      select (s - 'participant_id' - 'sort_order')
             || jsonb_build_object('rank', rank() over (order by (s->>'total')::int desc)) as r
      from jsonb_array_elements(v_scores) s
    ) x;

  select coalesce(jsonb_agg(s->>'name' order by (s->>'sort_order')::int), '[]'::jsonb)
    into v_winners
    from jsonb_array_elements(v_scores) s
   where v_top > 0 and (s->>'total')::int = v_top;

  return jsonb_build_object(
    'standings', coalesce(v_rows, '[]'::jsonb),
    'winners', v_winners,
    'tie', jsonb_array_length(v_winners) > 1,
    'top_score', v_top
  );
end;
$$;

create function private.advent_questions_json()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'title', title, 'prompt', prompt) order by sort), '[]'::jsonb)
  from public.advent_questions;
$$;

create function private.advent_config_json(cfg public.advent_settings)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'year', cfg.year,
    'tz', cfg.tz,
    'correct_points', cfg.correct_points,
    'streak_bonuses', cfg.streak_bonuses,
    'complete_bonus', cfg.complete_bonus
  );
$$;

create function private.advent_my_memories_json(p_participant_id uuid)
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
           'created_at', m.created_at
         ) order by m.created_at desc), '[]'::jsonb)
  from public.advent_memories m
  join public.advent_questions q on q.id = m.question_id
  where m.author_id = p_participant_id;
$$;

create function private.advent_day_json(p public.participants, p_day integer)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  cfg public.advent_settings := private.advent_cfg(p.event_id);
  v_today integer := private.advent_today(cfg);
  m public.advent_memories;
  q public.advent_questions;
  g public.advent_guesses;
  v_guess jsonb := null;
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

  select * into g from public.advent_guesses where memory_id = m.id and participant_id = p.id;
  if g.id is not null then
    v_guess := jsonb_build_object(
      'guessed_name', (select name from public.participants where id = g.guessed_id),
      'author_name', (select name from public.participants where id = m.author_id),
      'correct', g.is_correct,
      'on_time', g.on_time,
      'points', case when g.is_correct then cfg.correct_points else 0 end,
      'guessed_at', g.guessed_at
    );
  elsif not v_own and v_today <= 24 then
    select jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name) order by x.sort_order)
      into v_options
      from public.participants x
     where x.event_id = p.event_id and x.id <> p.id;
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
    'options', v_options,
    'can_guess', v_options is not null,
    'late', p_day < v_today,
    'game_over', v_today > 24,
    'correct_points', cfg.correct_points
  );
end;
$$;

create function private.advent_admin_json(p_event_id uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  cfg public.advent_settings := private.advent_cfg(p_event_id);
  v_today integer := private.advent_today(cfg);
begin
  return jsonb_build_object(
    'event_name', (select name from public.events where id = p_event_id),
    'today', v_today,
    'config', private.advent_config_json(cfg),
    'participants', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', x.id, 'name', x.name,
               'memory_count', (select count(*) from public.advent_memories m where m.author_id = x.id)
             ) order by x.sort_order), '[]'::jsonb)
      from public.participants x where x.event_id = p_event_id
    ),
    'questions', private.advent_questions_json(),
    'memories', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', m.id,
               'author_name', a.name,
               'question_id', m.question_id,
               'title', q.title,
               'body', m.body,
               'original_body', m.original_body,
               'edited', m.body <> m.original_body,
               'status', m.status,
               'day', m.day,
               'published', m.day is not null and m.day <= v_today,
               'guess_count', (select count(*) from public.advent_guesses g where g.memory_id = m.id),
               'created_at', m.created_at
             ) order by m.created_at), '[]'::jsonb)
      from public.advent_memories m
      join public.participants a on a.id = m.author_id
      join public.advent_questions q on q.id = m.question_id
      where m.event_id = p_event_id
    ),
    'days', (
      select jsonb_agg(jsonb_build_object(
               'day', d,
               'memory_id', m.id,
               'title', q.title,
               'unlocked', d <= v_today
             ) order by d)
      from generate_series(1, 24) d
      left join public.advent_memories m on m.event_id = p_event_id and m.day = d
      left join public.advent_questions q on q.id = m.question_id
    )
  );
end;
$$;

-- ---------- participant API ----------

create function public.advent_state(p_token text)
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
                 when g.id is null then 'open'
                 when g.is_correct then 'correct'
                 else 'wrong'
               end
             ) order by d)
      from generate_series(1, 24) d
      left join public.advent_memories m on m.event_id = p.event_id and m.day = d and d <= v_today
      left join public.advent_guesses g on g.memory_id = m.id and g.participant_id = p.id
    )
  );
end;
$$;

create function public.advent_day(p_token text, p_day integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return private.advent_day_json(private.advent_participant(p_token), p_day);
end;
$$;

create function public.advent_guess(p_token text, p_day integer, p_guessed_id uuid)
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
    raise exception 'Izvēlies kādu no ģimenes.' using errcode = '22023';
  end if;

  begin
    insert into public.advent_guesses
      (memory_id, event_id, participant_id, guessed_id, day, is_correct, guessed_at, guessed_local_date, on_time)
    values
      (m.id, p.event_id, p.id, p_guessed_id, p_day, p_guessed_id = m.author_id,
       private.advent_now(cfg), private.advent_local_date(cfg), p_day = v_today);
  exception when unique_violation then
    raise exception 'Tu jau esi minējis šo atmiņu — minējumu nevar mainīt.' using errcode = '23505';
  end;

  return private.advent_day_json(p, p_day);
end;
$$;

create function public.advent_my_memories(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return private.advent_my_memories_json((private.advent_participant(p_token)).id);
end;
$$;

create function public.advent_save_memory(p_token text, p_id uuid, p_question_id integer, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.participants := private.advent_participant(p_token);
  v_body text := btrim(coalesce(p_body, ''));
  v_n integer;
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
    insert into public.advent_memories (event_id, author_id, question_id, original_body, body)
    values (p.event_id, p.id, p_question_id, v_body, v_body);
  else
    update public.advent_memories
       set body = v_body, original_body = v_body, question_id = p_question_id, updated_at = now()
     where id = p_id and author_id = p.id and status = 'pending';
    if not found then
      raise exception 'Šo atmiņu vairs nevar labot — organizators to jau ir apskatījis.' using errcode = '22023';
    end if;
  end if;

  return private.advent_my_memories_json(p.id);
end;
$$;

create function public.advent_delete_memory(p_token text, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.participants := private.advent_participant(p_token);
begin
  delete from public.advent_memories where id = p_id and author_id = p.id and status = 'pending';
  if not found then
    raise exception 'Šo atmiņu vairs nevar izdzēst — organizators to jau ir apskatījis.' using errcode = '22023';
  end if;
  return private.advent_my_memories_json(p.id);
end;
$$;

create function public.advent_finale(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.participants := private.advent_participant(p_token);
  cfg public.advent_settings := private.advent_cfg(p.event_id);
  v_today integer := private.advent_today(cfg);
begin
  if v_today < 24 then
    raise exception 'Rezultāti tiks atklāti 24. decembrī!' using errcode = '42501';
  end if;
  return private.advent_standings(p.event_id) || jsonb_build_object(
    'event_name', (select name from public.events where id = p.event_id),
    'my_name', p.name,
    'year', cfg.year,
    'final', v_today > 24
  );
end;
$$;

-- ---------- organizer API ----------

create function public.advent_admin_state(p_admin_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return private.advent_admin_json(private.advent_admin_event(p_admin_token));
end;
$$;

create function public.advent_admin_review(p_admin_token text, p_id uuid, p_status text)
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
    raise exception 'Šī atmiņa jau ir publicēta kalendārā un to vairs nevar mainīt.' using errcode = '22023';
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

create function public.advent_admin_edit(p_admin_token text, p_id uuid, p_body text)
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
    raise exception 'Atmiņai jābūt no 3 līdz 2000 rakstzīmēm.' using errcode = '22023';
  end if;
  select * into m from public.advent_memories where id = p_id and event_id = v_event;
  if m.id is null then
    raise exception 'Atmiņa nav atrasta.' using errcode = 'P0002';
  end if;
  if m.day is not null and m.day <= v_today then
    raise exception 'Šī atmiņa jau ir publicēta kalendārā un to vairs nevar mainīt.' using errcode = '22023';
  end if;
  update public.advent_memories set body = v_body, updated_at = now() where id = p_id;
  return private.advent_admin_json(v_event);
end;
$$;

create function public.advent_admin_assign(p_admin_token text, p_id uuid, p_day integer)
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
    raise exception 'Vispirms apstipriniet atmiņu.' using errcode = '22023';
  end if;
  if m.day is not null and m.day <= v_today then
    raise exception 'Šī atmiņa jau ir publicēta kalendārā un to vairs nevar pārvietot.' using errcode = '22023';
  end if;
  if p_day is not null then
    if p_day < greatest(v_today, 1) or p_day > 24 then
      raise exception 'Pagājušās dienas vairs nevar mainīt — izvēlieties šodienu vai kādu nākamo dienu.' using errcode = '22023';
    end if;
    if exists (select 1 from public.advent_memories where event_id = v_event and day = p_day and id <> p_id) then
      raise exception 'Šai dienai jau ir atmiņa.' using errcode = '22023';
    end if;
  end if;

  update public.advent_memories set day = p_day, updated_at = now() where id = p_id;
  return private.advent_admin_json(v_event);
end;
$$;

-- Fill empty days (today onwards) with approved, unscheduled memories in random order.
create function public.advent_admin_autofill(p_admin_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event uuid := private.advent_admin_event(p_admin_token);
  v_today integer := private.advent_today(private.advent_cfg(v_event));
  v_mem uuid;
  v_day integer;
begin
  for v_mem in
    select id from public.advent_memories
     where event_id = v_event and status = 'approved' and day is null
     order by extensions.gen_random_uuid()
  loop
    select d into v_day
      from generate_series(greatest(v_today, 1), 24) d
     where not exists (select 1 from public.advent_memories where event_id = v_event and day = d)
     order by d
     limit 1;
    exit when v_day is null;
    update public.advent_memories set day = v_day, updated_at = now() where id = v_mem;
  end loop;
  return private.advent_admin_json(v_event);
end;
$$;

create function public.advent_admin_finale(p_admin_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event uuid := private.advent_admin_event(p_admin_token);
  cfg public.advent_settings := private.advent_cfg(v_event);
  v_today integer := private.advent_today(cfg);
begin
  if v_today < 24 then
    raise exception 'Rezultāti tiks atklāti 24. decembrī!' using errcode = '42501';
  end if;
  return private.advent_standings(v_event) || jsonb_build_object(
    'event_name', (select name from public.events where id = v_event),
    'my_name', null,
    'year', cfg.year,
    'final', v_today > 24
  );
end;
$$;

-- ---------- privileges ----------
revoke all on function
  private.advent_guesses_immutable(),
  private.advent_cfg(uuid),
  private.advent_now(public.advent_settings),
  private.advent_local_date(public.advent_settings),
  private.advent_today(public.advent_settings),
  private.advent_participant(text),
  private.advent_admin_event(text),
  private.advent_scores(uuid),
  private.advent_standings(uuid),
  private.advent_questions_json(),
  private.advent_config_json(public.advent_settings),
  private.advent_my_memories_json(uuid),
  private.advent_day_json(public.participants, integer),
  private.advent_admin_json(uuid)
from public, anon, authenticated;

revoke all on function
  public.advent_state(text),
  public.advent_day(text, integer),
  public.advent_guess(text, integer, uuid),
  public.advent_my_memories(text),
  public.advent_save_memory(text, uuid, integer, text),
  public.advent_delete_memory(text, uuid),
  public.advent_finale(text),
  public.advent_admin_state(text),
  public.advent_admin_review(text, uuid, text),
  public.advent_admin_edit(text, uuid, text),
  public.advent_admin_assign(text, uuid, integer),
  public.advent_admin_autofill(text),
  public.advent_admin_finale(text)
from public;

grant execute on function
  public.advent_state(text),
  public.advent_day(text, integer),
  public.advent_guess(text, integer, uuid),
  public.advent_my_memories(text),
  public.advent_save_memory(text, uuid, integer, text),
  public.advent_delete_memory(text, uuid),
  public.advent_finale(text),
  public.advent_admin_state(text),
  public.advent_admin_review(text, uuid, text),
  public.advent_admin_edit(text, uuid, text),
  public.advent_admin_assign(text, uuid, integer),
  public.advent_admin_autofill(text),
  public.advent_admin_finale(text)
to anon, authenticated;
