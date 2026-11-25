-- Organizer settings for the Advent calendar (points, streak bonuses, time zone).
-- Settings can only change before the calendar opens (before 1 December in the
-- event's time zone), so points and bonuses already earned can never shift.

create function public.advent_admin_settings(
  p_admin_token    text,
  p_tz             text,
  p_correct_points integer,
  p_streak_bonuses jsonb,
  p_complete_bonus integer
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
         streak_bonuses = v_bonuses,
         complete_bonus = p_complete_bonus
   where event_id = v_event;

  return private.advent_admin_json(v_event);
end;
$$;

revoke all on function public.advent_admin_settings(text, text, integer, jsonb, integer) from public;
grant execute on function public.advent_admin_settings(text, text, integer, jsonb, integer) to anon, authenticated;
