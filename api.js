/**
 * API LAYER — Supabase-backed
 * ------------------------------------------------------------------
 * This is the ONLY file that should talk to Supabase directly for
 * student-facing data. Admin-only writes live in admin-api.js.
 * Every page calls functions from here (Api.xxx), never `sb` directly,
 * except the admin pages which additionally use AdminApi.
 * ------------------------------------------------------------------
 */

function throwIfError(error, fallbackMsg) {
  if (error) throw new Error(error.message || fallbackMsg);
}

const Api = {
  /**
   * Tests visible to the current student: published AND (public OR
   * explicitly granted). Uses the list_my_tests() RPC so access rules
   * are enforced server-side, not just hidden in the UI.
   */
  async listTests() {
    const { data, error } = await sb.rpc("list_my_tests");
    throwIfError(error, "Failed to load mock tests.");
    return (data || []).map(normalizeTest);
  },

  /** Metadata for a single test (info/start page). RLS only allows published tests. */
  async getTest(testId) {
    const { data, error } = await sb
      .from("mock_tests")
      .select("*")
      .eq("id", testId)
      .single();
    throwIfError(error, "Failed to load test.");
    return normalizeTest(data);
  },

  /**
   * Question set for taking the test — via RPC so correct_answer /
   * explanation never reach the browser before submission.
   */
  async getTestQuestions(testId) {
    const { data, error } = await sb.rpc("get_test_questions", { p_test_id: testId });
    throwIfError(error, "Failed to load questions.");
    return (data || []).map(normalizeQuestion);
  },

  /**
   * Full question set INCLUDING correct_answer/explanation, for the results
   * review screen. Only returns data if the current student has at least one
   * SUBMITTED attempt on this test (enforced by the RPC, not just the UI).
   */
  async getReviewQuestions(testId) {
    const { data, error } = await sb.rpc("get_review_questions", { p_test_id: testId });
    throwIfError(error, "Failed to load answer review.");
    return (data || []).map((row) => ({
      id: row.id,
      section: row.section,
      topic: row.topic,
      difficulty: row.difficulty,
      question_text: row.question_text,
      options: { A: row.option_a, B: row.option_b, C: row.option_c, D: row.option_d },
      correct_answer: row.correct_answer,
      explanation: row.explanation || "",
      order_index: row.order_index,
    }));
  },

  /** Starts (or resumes) an attempt. Server enforces access rules. */
  async startAttempt(testId) {
    const { data, error } = await sb.rpc("start_attempt", { p_test_id: testId });
    throwIfError(error, "Failed to start attempt.");
    return normalizeAttempt(data);
  },

  async getAttempt(attemptId) {
    const { data, error } = await sb
      .from("attempts")
      .select("*")
      .eq("id", attemptId)
      .single();
    throwIfError(error, "Failed to load attempt.");
    return normalizeAttempt(data);
  },

  /** Saves in-progress answer/mark state. Called frequently (autosave). */
  async saveAttemptProgress(attemptId, { answers, marked }) {
    const { data, error } = await sb
      .from("attempts")
      .update({ answers, marked })
      .eq("id", attemptId)
      .select()
      .single();
    throwIfError(error, "Failed to save progress.");
    return normalizeAttempt(data);
  },

  /**
   * Submits the attempt. The submit_attempt() RPC computes the
   * authoritative score server-side — the client never supplies a score.
   */
  async submitAttempt(attemptId) {
    const { data, error } = await sb.rpc("submit_attempt", { p_attempt_id: attemptId });
    throwIfError(error, "Failed to submit attempt.");
    return normalizeAttempt(data);
  },

  /** Current student's past attempts, most recent first. */
  async listMyAttempts() {
    const {
      data: { session },
    } = await sb.auth.getSession();
    if (!session) return [];
    const { data, error } = await sb
      .from("attempts")
      .select("*")
      .eq("student_id", session.user.id)
      .order("started_at", { ascending: false });
    throwIfError(error, "Failed to load attempts.");
    return (data || []).map(normalizeAttempt);
  },

  /** Current user's profile row (role, name, student_id). */
  async getCurrentProfile() {
    const {
      data: { session },
    } = await sb.auth.getSession();
    if (!session) return null;
    const { data, error } = await sb
      .from("profiles")
      .select("*")
      .eq("id", session.user.id)
      .single();
    if (error) return null;
    return data;
  },
};

// ---- Shape adapters: DB rows -> the shapes the UI already expects ----

function normalizeTest(row) {
  if (!row) return row;
  return {
    id: row.id,
    title: row.title,
    description: row.description || "",
    test_number: row.test_number,
    duration_minutes: row.duration_minutes,
    published: row.published,
    is_public: row.is_public,
    section_breakdown: row.section_breakdown || null, // filled in by caller if needed
  };
}

function normalizeQuestion(row) {
  return {
    id: row.id,
    section: row.section,
    topic: row.topic,
    subtopic: null,
    difficulty: row.difficulty,
    question_text: row.question_text,
    options: { A: row.option_a, B: row.option_b, C: row.option_c, D: row.option_d },
    order_index: row.order_index,
    // correct_answer / explanation intentionally absent pre-submission
  };
}

function normalizeAttempt(row) {
  if (!row) return row;
  return {
    id: row.id,
    test_id: row.test_id,
    student_id: row.student_id,
    status: row.status,
    started_at: row.started_at,
    submitted_at: row.submitted_at,
    answers: row.answers || {},
    marked: row.marked || {},
    result: row.result || null,
  };
}

window.Api = Api;
