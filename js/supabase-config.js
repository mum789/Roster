// =============================================================
// Supabase Configuration - Roster Duty Portal
// =============================================================
// INSTRUCTIONS:
// 1. Replace SUPABASE_URL with your Supabase project URL
// 2. Replace SUPABASE_ANON_KEY with your Supabase anon/public key
// 3. Replace ADMIN_EMAIL with the admin login email used in Supabase Auth
// 4. Ensure the Supabase JS SDK script tag is loaded BEFORE this file
// =============================================================

// ─── CONFIG: Update these values ─────────────────────────────
const SUPABASE_URL = 'https://swkamzbjswywdpifxvjl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN3a2FtemJqc3d5d2RwaWZ4dmpsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyOTM2MDgsImV4cCI6MjEwMDg2OTYwOH0.cTHp-Wmyk0tRG7CXzMT3qljyQJrtKVBswDer2BVwH2Q';
const ADMIN_EMAIL = 'admin@roster.com';
// ─────────────────────────────────────────────────────────────

// ─── Initialize Supabase Client ──────────────────────────────
// Schema 'roster' is set as default so all queries use roster.* tables
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  db: { schema: 'roster' },
  auth: {
    autoRefreshToken: true,
    persistSession: true
  }
});
