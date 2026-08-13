// SUPABASE EDGE FUNCTION: create-student
// ----------------------------------------------------------------------------
// Lets a logged-in ADMIN create a new student account (student_id + password)
// without exposing the service_role key to the browser. Deploy with:
//
//   supabase functions deploy create-student
//
// It reads two secrets that Supabase sets automatically for every project
// (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) — no manual secret setup needed.
//
// Called from admin-dashboard.html via:
//   sb.functions.invoke('create-student', { body: { student_id, name, password } })
// ----------------------------------------------------------------------------

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Set this to your deployed site's origin (e.g. via
// `supabase secrets set SITE_ORIGIN=https://yourusername.github.io`).
// Falls back to "*" only if the secret isn't set, so the function still
// works out of the box — but you should set SITE_ORIGIN before going live.
const SITE_ORIGIN = Deno.env.get("SITE_ORIGIN") || "*";

const CORS = {
  "Access-Control-Allow-Origin": SITE_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Vary": "Origin",
};

function studentIdToEmail(studentId: string) {
  return studentId.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "") + "@students.ibamock.local";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // 1. Verify the caller is a logged-in admin using their own JWT.
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace("Bearer ", "");
    if (!jwt) {
      return new Response(JSON.stringify({ error: "Not authenticated." }), { status: 401, headers: CORS });
    }

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: { user }, error: userErr } = await callerClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Not authenticated." }), { status: 401, headers: CORS });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).single();
    if (!profile || profile.role !== "admin") {
      return new Response(JSON.stringify({ error: "Admin access required." }), { status: 403, headers: CORS });
    }

    // 2. Create (or update) the student account.
    const body = await req.json();
    const student_id = String(body.student_id || "").trim();
    const name = String(body.name || student_id).trim();
    const password = String(body.password || "");

    if (!student_id || password.length < 6) {
      return new Response(
        JSON.stringify({ error: "Student ID is required and password must be at least 6 characters." }),
        { status: 400, headers: CORS }
      );
    }

    const email = studentIdToEmail(student_id);

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { student_id, name, role: "student" },
    });

    if (createErr) {
      // If the account already exists, update the password + profile instead.
      if (String(createErr.message).toLowerCase().includes("already")) {
        const { data: existing } = await admin
          .from("profiles")
          .select("id")
          .eq("student_id", student_id)
          .single();
        if (existing) {
          await admin.auth.admin.updateUserById(existing.id, { password });
          await admin.from("profiles").update({ name }).eq("id", existing.id);
          return new Response(JSON.stringify({ ok: true, updated: true, id: existing.id }), { headers: CORS });
        }
      }
      return new Response(JSON.stringify({ error: createErr.message }), { status: 400, headers: CORS });
    }

    return new Response(JSON.stringify({ ok: true, id: created.user?.id }), { headers: CORS });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: CORS });
  }
});
