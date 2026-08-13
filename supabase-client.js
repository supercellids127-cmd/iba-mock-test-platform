/**
 * SUPABASE CLIENT
 * ------------------------------------------------------------------
 * Loads the Supabase JS SDK from CDN (no build step) and creates the
 * single shared client used by every other file (`sb`).
 *
 * SETUP:
 *   1. Create a project at https://supabase.com
 *   2. Run schema.sql in the SQL Editor (once).
 *   3. Paste your Project URL and anon/public key below.
 *      Project Settings → API → Project URL / anon public key.
 *   4. Make your first admin: sign up once through login.html, then in
 *      the SQL editor run:
 *        update public.profiles set role = 'admin' where student_id = 'YOUR_LOGIN';
 * ------------------------------------------------------------------
 */

const SUPABASE_URL = "https://lnjtvvvgllwjvxavbedi.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_mIu47rCeb90sGZuLTCIASg_9pUobqB5";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
window.sb = sb;
