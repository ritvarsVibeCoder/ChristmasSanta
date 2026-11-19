import { createClient } from '@supabase/supabase-js';

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
    const err = new Error(error.message || 'Something went wrong. Please try again.');
    err.code = error.code;
    throw err;
  }
  return data;
}

export const api = {
  createEvent: (name, budgetMin, budgetMax, names) =>
    rpc('create_event', { p_name: name, p_budget_min: budgetMin, p_budget_max: budgetMax, p_names: names }),
  getEventAdmin: (adminToken) => rpc('get_event_admin', { p_admin_token: adminToken }),
  redrawEvent: (adminToken) => rpc('redraw_event', { p_admin_token: adminToken }),
  openCard: (token) => rpc('open_card', { p_token: token }),
  revealCard: (token) => rpc('reveal_card', { p_token: token }),
};
