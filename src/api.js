import { createClient } from '@supabase/supabase-js';
import { tidyLatvianText } from './textfix.js';

// The publishable key is meant to be public: the database only exposes
// token-checked functions, and the tables themselves are not readable.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://obcczimaslzgwktosisb.supabase.co';
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_EtanhK2vMeC-EywKpiNuyA_2_RyeYGn';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function rpc(fn, args) {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    const err = new Error(error.message || 'Kaut kas nogāja greizi. Lūdzu, mēģini vēlreiz.');
    err.code = error.code;
    throw err;
  }
  return data;
}

// AI proofreading (Supabase Edge Function "fix-grammar" → Claude). Never blocks a
// save: if it is slow, unavailable or not configured, the tidied text is used.
async function fixGrammar(token, text) {
  const tidied = tidyLatvianText(text);
  try {
    const timeout = new Promise((resolve) => setTimeout(() => resolve(null), 20000));
    const call = supabase.functions.invoke('fix-grammar', { body: { token, text: tidied } }).then(({ data, error }) =>
      error || !data || typeof data.text !== 'string' ? null : data,
    );
    const res = await Promise.race([call, timeout]);
    if (res && res.text.trim()) return { text: tidyLatvianText(res.text), corrected: !!res.corrected };
  } catch {
    /* fall back to the tidied text */
  }
  return { text: tidied, corrected: false };
}

export const api = {
  fixGrammar,
  createEvent: (name, budgetMin, budgetMax, names) =>
    rpc('create_event', { p_name: name, p_budget_min: budgetMin, p_budget_max: budgetMax, p_names: names }),
  getEventAdmin: (adminToken) => rpc('get_event_admin', { p_admin_token: adminToken }),
  redrawEvent: (adminToken) => rpc('redraw_event', { p_admin_token: adminToken }),
  openCard: (token) => rpc('open_card', { p_token: token }),
  revealCard: (token) => rpc('reveal_card', { p_token: token }),

  // Advent calendar (same secret tokens as above)
  adventState: (token) => rpc('advent_state', { p_token: token }),
  adventDay: (token, day) => rpc('advent_day', { p_token: token, p_day: day }),
  adventGuess: (token, day, guessedId) => rpc('advent_guess', { p_token: token, p_day: day, p_guessed_id: guessedId }),
  adventMyMemories: (token) => rpc('advent_my_memories', { p_token: token }),
  adventSaveMemory: (token, id, questionId, body) =>
    rpc('advent_save_memory', { p_token: token, p_id: id, p_question_id: questionId, p_body: tidyLatvianText(body) }),
  adventDeleteMemory: (token, id) => rpc('advent_delete_memory', { p_token: token, p_id: id }),
  adventFinale: (token) => rpc('advent_finale', { p_token: token }),
  adventAdminState: (adminToken) => rpc('advent_admin_state', { p_admin_token: adminToken }),
  adventAdminReview: (adminToken, id, status) =>
    rpc('advent_admin_review', { p_admin_token: adminToken, p_id: id, p_status: status }),
  adventAdminEdit: (adminToken, id, body) =>
    rpc('advent_admin_edit', { p_admin_token: adminToken, p_id: id, p_body: tidyLatvianText(body) }),
  adventAdminAssign: (adminToken, id, day) => rpc('advent_admin_assign', { p_admin_token: adminToken, p_id: id, p_day: day }),
  adventAdminAutofill: (adminToken) => rpc('advent_admin_autofill', { p_admin_token: adminToken }),
  adventAdminFinale: (adminToken) => rpc('advent_admin_finale', { p_admin_token: adminToken }),
  adventAdminSettings: (adminToken, tz, correctPoints, secondTryPoints, streakBonuses, completeBonus) =>
    rpc('advent_admin_settings', {
      p_admin_token: adminToken,
      p_tz: tz,
      p_correct_points: correctPoints,
      p_second_try_points: secondTryPoints,
      p_streak_bonuses: streakBonuses,
      p_complete_bonus: completeBonus,
    }),
};
