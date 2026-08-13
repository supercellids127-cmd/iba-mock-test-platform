-- ============================================================================
-- IBA DU MOCK TEST PLATFORM — SUPABASE SCHEMA
-- Run this once in the Supabase SQL editor (Project → SQL Editor → New query).
-- Safe to re-run: uses IF NOT EXISTS / DROP POLICY IF EXISTS guards.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. PROFILES  (one row per auth user; tells us admin vs student + display name)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  student_id text unique,             -- human-friendly login label e.g. "IBA34-2201"
  name text,
  role text not null default 'student' check (role in ('student','admin')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- Admins can see every profile (needed for the "assign test to student" UI)
drop policy if exists "profiles_admin_select_all" on public.profiles;
create policy "profiles_admin_select_all" on public.profiles
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

drop policy if exists "profiles_admin_update_all" on public.profiles;
create policy "profiles_admin_update_all" on public.profiles
  for update using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- Auto-create a profile row whenever a new auth user signs up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, student_id, name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'student_id', new.email),
    coalesce(new.raw_user_meta_data->>'name', new.email),
    coalesce(new.raw_user_meta_data->>'role', 'student')
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 2. MOCK TESTS
-- ---------------------------------------------------------------------------
create table if not exists public.mock_tests (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text default '',
  test_number int not null default 1,
  duration_minutes int not null default 75,
  published boolean not null default false,
  -- true = every logged-in student can take it. false = only students in
  -- test_access (table below) can take it.
  is_public boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.mock_tests enable row level security;

-- Everyone (incl. anon, for the public test list) can read published tests
drop policy if exists "tests_select_published" on public.mock_tests;
create policy "tests_select_published" on public.mock_tests
  for select using (published = true);

-- Admins can read/write everything, including unpublished/draft tests
drop policy if exists "tests_admin_all" on public.mock_tests;
create policy "tests_admin_all" on public.mock_tests
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  ) with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- ---------------------------------------------------------------------------
-- 3. TEST ACCESS  (per-student allow-list for private tests)
-- ---------------------------------------------------------------------------
create table if not exists public.test_access (
  id uuid primary key default gen_random_uuid(),
  test_id uuid not null references public.mock_tests(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  granted_at timestamptz not null default now(),
  unique (test_id, student_id)
);

alter table public.test_access enable row level security;

drop policy if exists "access_select_own" on public.test_access;
create policy "access_select_own" on public.test_access
  for select using (student_id = auth.uid());

drop policy if exists "access_admin_all" on public.test_access;
create policy "access_admin_all" on public.test_access
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  ) with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- ---------------------------------------------------------------------------
-- 4. QUESTIONS
-- ---------------------------------------------------------------------------
create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  test_id uuid not null references public.mock_tests(id) on delete cascade,
  section text not null check (section in ('ENGLISH','MATHEMATICS','ANALYTICAL')),
  topic text not null default 'General',
  difficulty text not null default 'MEDIUM' check (difficulty in ('EASY','MEDIUM','HARD')),
  question_text text not null,
  option_a text not null,
  option_b text not null,
  option_c text not null,
  option_d text not null,
  correct_answer text not null check (correct_answer in ('A','B','C','D')),
  explanation text default '',
  order_index int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.questions enable row level security;

-- Students may read questions (without the answer key — see get_test_questions
-- RPC below) only for tests they may access. Direct table select is restricted
-- to admins; the app uses the RPC functions for student-facing reads so the
-- correct answer never reaches the browser before submission.
drop policy if exists "questions_admin_all" on public.questions;
create policy "questions_admin_all" on public.questions
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  ) with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- ---------------------------------------------------------------------------
-- 5. ATTEMPTS
-- ---------------------------------------------------------------------------
create table if not exists public.attempts (
  id uuid primary key default gen_random_uuid(),
  test_id uuid not null references public.mock_tests(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'IN_PROGRESS' check (status in ('IN_PROGRESS','SUBMITTED')),
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  answers jsonb not null default '{}'::jsonb,
  marked jsonb not null default '{}'::jsonb,
  result jsonb,
  created_at timestamptz not null default now()
);

alter table public.attempts enable row level security;

drop policy if exists "attempts_select_own" on public.attempts;
create policy "attempts_select_own" on public.attempts
  for select using (student_id = auth.uid());

drop policy if exists "attempts_insert_own" on public.attempts;
create policy "attempts_insert_own" on public.attempts
  for insert with check (student_id = auth.uid());

drop policy if exists "attempts_update_own_in_progress" on public.attempts;
create policy "attempts_update_own_in_progress" on public.attempts
  for update using (student_id = auth.uid() and status = 'IN_PROGRESS');

drop policy if exists "attempts_admin_all" on public.attempts;
create policy "attempts_admin_all" on public.attempts
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  ) with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- ---------------------------------------------------------------------------
-- 6. HELPER: can a given student access a given test?
-- ---------------------------------------------------------------------------
create or replace function public.can_access_test(p_test_id uuid, p_student uuid)
returns boolean as $$
declare
  v_public boolean;
  v_published boolean;
begin
  select is_public, published into v_public, v_published
  from public.mock_tests where id = p_test_id;

  if v_published is not true then
    return false;
  end if;

  if v_public then
    return true;
  end if;

  return exists (
    select 1 from public.test_access
    where test_id = p_test_id and student_id = p_student
  );
end;
$$ language plpgsql security definer stable;

-- ---------------------------------------------------------------------------
-- 7. RPC: list tests visible to the current logged-in student
--    (published AND (is_public OR has an access grant))
-- ---------------------------------------------------------------------------
create or replace function public.list_my_tests()
returns setof public.mock_tests as $$
  select t.* from public.mock_tests t
  where t.published = true
    and (
      t.is_public = true
      or exists (
        select 1 from public.test_access a
        where a.test_id = t.id and a.student_id = auth.uid()
      )
    )
  order by t.test_number asc;
$$ language sql security definer stable;

-- ---------------------------------------------------------------------------
-- 8. RPC: get questions for taking a test — STRIPS correct_answer/explanation
--    so a curious student can't read the answer key from network tab.
-- ---------------------------------------------------------------------------
create or replace function public.get_test_questions(p_test_id uuid)
returns table (
  id uuid, section text, topic text, difficulty text,
  question_text text, option_a text, option_b text, option_c text, option_d text,
  order_index int
) as $$
begin
  if not public.can_access_test(p_test_id, auth.uid()) then
    raise exception 'Access denied for this test.';
  end if;

  return query
    select q.id, q.section, q.topic, q.difficulty, q.question_text,
           q.option_a, q.option_b, q.option_c, q.option_d, q.order_index
    from public.questions q
    where q.test_id = p_test_id
    order by q.order_index asc, q.created_at asc;
end;
$$ language plpgsql security definer stable;

-- ---------------------------------------------------------------------------
-- 8b. RPC: full questions incl. answer key + explanation, for the results
--     review screen. Only returns rows if the current student has at least
--     one SUBMITTED attempt on this test — students can't peek at answers
--     for a test they haven't finished.
-- ---------------------------------------------------------------------------
create or replace function public.get_review_questions(p_test_id uuid)
returns table (
  id uuid, section text, topic text, difficulty text,
  question_text text, option_a text, option_b text, option_c text, option_d text,
  correct_answer text, explanation text, order_index int
) as $$
begin
  if not exists (
    select 1 from public.attempts
    where test_id = p_test_id and student_id = auth.uid() and status = 'SUBMITTED'
  ) then
    raise exception 'No submitted attempt found for this test.';
  end if;

  return query
    select q.id, q.section, q.topic, q.difficulty, q.question_text,
           q.option_a, q.option_b, q.option_c, q.option_d,
           q.correct_answer, q.explanation, q.order_index
    from public.questions q
    where q.test_id = p_test_id
    order by q.order_index asc, q.created_at asc;
end;
$$ language plpgsql security definer stable;

-- ---------------------------------------------------------------------------
-- 9. RPC: start an attempt (creates row if none in progress, else resumes)
-- ---------------------------------------------------------------------------
create or replace function public.start_attempt(p_test_id uuid)
returns public.attempts as $$
declare
  v_existing public.attempts;
  v_new public.attempts;
begin
  if not public.can_access_test(p_test_id, auth.uid()) then
    raise exception 'Access denied for this test.';
  end if;

  select * into v_existing from public.attempts
    where test_id = p_test_id and student_id = auth.uid() and status = 'IN_PROGRESS'
    order by started_at desc limit 1;

  if found then
    return v_existing;
  end if;

  insert into public.attempts (test_id, student_id)
  values (p_test_id, auth.uid())
  returning * into v_new;

  return v_new;
end;
$$ language plpgsql security definer;

-- ---------------------------------------------------------------------------
-- 10. RPC: submit an attempt — SERVER computes the score. Client never
--     supplies the score, only its own answers. This is the authoritative
--     scoring path (mirrors js/scoring.js logic, kept in sync manually).
-- ---------------------------------------------------------------------------
create or replace function public.submit_attempt(p_attempt_id uuid)
returns public.attempts as $$
declare
  v_attempt public.attempts;
  v_result jsonb;
  v_total_score int := 0;
  v_total_questions int := 0;
  v_total_correct int := 0;
  v_total_answered int := 0;
  v_sections jsonb := '{}'::jsonb;
  v_topics jsonb := '{}'::jsonb;
  v_per_question jsonb := '[]'::jsonb;
  r record;
  v_selected text;
  v_is_correct boolean;
  v_was_answered boolean;
  v_recommendations jsonb := '[]'::jsonb;
begin
  select * into v_attempt from public.attempts
    where id = p_attempt_id and student_id = auth.uid();

  if not found then
    raise exception 'Attempt not found.';
  end if;

  if v_attempt.status = 'SUBMITTED' then
    return v_attempt; -- idempotent
  end if;

  -- per-section / per-topic accumulators kept as jsonb maps built incrementally
  for r in
    select q.id, q.section, q.topic, q.correct_answer
    from public.questions q
    where q.test_id = v_attempt.test_id
    order by q.order_index asc, q.created_at asc
  loop
    v_total_questions := v_total_questions + 1;
    v_selected := v_attempt.answers ->> r.id::text;
    v_was_answered := v_selected is not null;
    v_is_correct := v_was_answered and v_selected = r.correct_answer;

    if v_was_answered then v_total_answered := v_total_answered + 1; end if;
    if v_is_correct then
      v_total_score := v_total_score + 1;
      v_total_correct := v_total_correct + 1;
    end if;

    -- section accumulate
    v_sections := jsonb_set(
      v_sections, array[r.section],
      coalesce(v_sections -> r.section, jsonb_build_object('total',0,'correct',0,'answered',0))
        || jsonb_build_object(
             'total', coalesce((v_sections -> r.section ->> 'total')::int, 0) + 1,
             'correct', coalesce((v_sections -> r.section ->> 'correct')::int, 0) + (case when v_is_correct then 1 else 0 end),
             'answered', coalesce((v_sections -> r.section ->> 'answered')::int, 0) + (case when v_was_answered then 1 else 0 end)
           ),
      true
    );

    -- topic accumulate
    v_topics := jsonb_set(
      v_topics, array[r.topic],
      coalesce(v_topics -> r.topic, jsonb_build_object('total',0,'correct',0))
        || jsonb_build_object(
             'total', coalesce((v_topics -> r.topic ->> 'total')::int, 0) + 1,
             'correct', coalesce((v_topics -> r.topic ->> 'correct')::int, 0) + (case when v_is_correct then 1 else 0 end)
           ),
      true
    );

    v_per_question := v_per_question || jsonb_build_array(jsonb_build_object(
      'question_id', r.id,
      'section', r.section,
      'topic', r.topic,
      'selected_answer', v_selected,
      'correct_answer', r.correct_answer,
      'is_correct', v_is_correct,
      'was_answered', v_was_answered
    ));
  end loop;

  -- fold section/topic maps into percentage-annotated arrays
  declare
    v_sec_out jsonb := '{}'::jsonb;
    v_topic_out jsonb := '[]'::jsonb;
    k text; v jsonb;
  begin
    for k, v in select * from jsonb_each(v_sections) loop
      v_sec_out := v_sec_out || jsonb_build_object(k,
        v || jsonb_build_object(
          'score', (v->>'correct')::int,
          'accuracy', case when (v->>'answered')::int > 0
            then round(((v->>'correct')::numeric / (v->>'answered')::numeric) * 100) else 0 end,
          'percentage', case when (v->>'total')::int > 0
            then round(((v->>'correct')::numeric / (v->>'total')::numeric) * 100) else 0 end
        ));
    end loop;
    for k, v in select * from jsonb_each(v_topics) loop
      v_topic_out := v_topic_out || jsonb_build_array(jsonb_build_object(
        'topic', k,
        'correct', (v->>'correct')::int,
        'total', (v->>'total')::int,
        'percentage', case when (v->>'total')::int > 0
          then round(((v->>'correct')::numeric / (v->>'total')::numeric) * 100) else 0 end
      ));
    end loop;

    v_result := jsonb_build_object(
      'total_score', v_total_score,
      'total_questions', v_total_questions,
      'total_percentage', case when v_total_questions > 0
        then round((v_total_correct::numeric / v_total_questions::numeric) * 100) else 0 end,
      'overall_accuracy', case when v_total_answered > 0
        then round((v_total_correct::numeric / v_total_answered::numeric) * 100) else 0 end,
      'sections', v_sec_out,
      'topic_performance', v_topic_out,
      'per_question', v_per_question,
      'recommendations', v_recommendations
    );
  end;

  update public.attempts
    set status = 'SUBMITTED', submitted_at = now(), result = v_result
    where id = p_attempt_id
    returning * into v_attempt;

  return v_attempt;
end;
$$ language plpgsql security definer;

-- ---------------------------------------------------------------------------
-- 11. Indexes
-- ---------------------------------------------------------------------------
create index if not exists idx_questions_test on public.questions(test_id);
create index if not exists idx_attempts_student on public.attempts(student_id);
create index if not exists idx_attempts_test on public.attempts(test_id);
create index if not exists idx_test_access_student on public.test_access(student_id);
create index if not exists idx_test_access_test on public.test_access(test_id);

-- ---------------------------------------------------------------------------
-- 12. Make yourself the first admin AFTER you sign up once through the app:
--   update public.profiles set role = 'admin' where student_id = 'YOUR_LOGIN';
-- ---------------------------------------------------------------------------
