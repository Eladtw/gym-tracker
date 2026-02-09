import { createClient } from '@supabase/supabase-js';

const url  = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const anon = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

console.log('SB env loaded?', { url, anonLen: anon?.length }); // בדיקה חד-פעמית

if (!url || !anon) {
  console.error('❌ Missing Supabase envs. Check .env.local and restart dev server.');
}

export const supabase = createClient(url, anon);
