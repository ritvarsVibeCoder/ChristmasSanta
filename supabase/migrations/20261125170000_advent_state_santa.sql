-- The Advent calendar shows the participant's own Secret Santa match at the top,
-- but only after they have scratched their card (so nothing gets spoiled).

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
  e public.events;
begin
  select * into e from public.events where id = p.event_id;
  select s into v_me from jsonb_array_elements(private.advent_scores(p.event_id)) s
   where (s->>'participant_id')::uuid = p.id;

  return jsonb_build_object(
    'event_name', e.name,
    'my_name', p.name,
    'santa', jsonb_build_object(
      'revealed', p.revealed_at is not null,
      'receiver_name', case when p.revealed_at is not null
                            then (select name from public.participants where id = p.receiver_id) end,
      'budget_min', e.budget_min,
      'budget_max', e.budget_max
    ),
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
