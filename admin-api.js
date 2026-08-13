/**
 * ADMIN API LAYER
 * ------------------------------------------------------------------
 * Every function here relies on Supabase RLS policies that only allow
 * these operations when the logged-in user's profile has role='admin'
 * (see schema.sql, "_admin_all" policies). If a non-admin somehow
 * calls these, Supabase itself will reject the write/read — this file
 * is a convenience wrapper, not the security boundary.
 * ------------------------------------------------------------------
 */

function athrow(error, fallback) {
  if (error) throw new Error(error.message || fallback);
}

const AdminApi = {
  // ---------------- Tests ----------------

  async listAllTests() {
    const { data, error } = await sb
      .from("mock_tests")
      .select("*")
      .order("test_number", { ascending: true });
    athrow(error, "Failed to load tests.");
    return data || [];
  },

  async createTest({ title, description, test_number, duration_minutes, is_public }) {
    const {
      data: { session },
    } = await sb.auth.getSession();
    const { data, error } = await sb
      .from("mock_tests")
      .insert({
        title,
        description,
        test_number,
        duration_minutes,
        is_public,
        published: false,
        created_by: session ? session.user.id : null,
      })
      .select()
      .single();
    athrow(error, "Failed to create test.");
    return data;
  },

  async updateTest(testId, patch) {
    const { data, error } = await sb
      .from("mock_tests")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", testId)
      .select()
      .single();
    athrow(error, "Failed to update test.");
    return data;
  },

  async deleteTest(testId) {
    const { error } = await sb.from("mock_tests").delete().eq("id", testId);
    athrow(error, "Failed to delete test.");
    return true;
  },

  async setPublished(testId, published) {
    return AdminApi.updateTest(testId, { published });
  },

  // ---------------- Questions ----------------

  async listQuestions(testId) {
    const { data, error } = await sb
      .from("questions")
      .select("*")
      .eq("test_id", testId)
      .order("order_index", { ascending: true })
      .order("created_at", { ascending: true });
    athrow(error, "Failed to load questions.");
    return data || [];
  },

  async createQuestion(testId, q) {
    const { data, error } = await sb
      .from("questions")
      .insert({
        test_id: testId,
        section: q.section,
        topic: q.topic || "General",
        difficulty: q.difficulty || "MEDIUM",
        question_text: q.question_text,
        option_a: q.option_a,
        option_b: q.option_b,
        option_c: q.option_c,
        option_d: q.option_d,
        correct_answer: q.correct_answer,
        explanation: q.explanation || "",
        order_index: q.order_index || 0,
      })
      .select()
      .single();
    athrow(error, "Failed to create question.");
    return data;
  },

  async updateQuestion(questionId, patch) {
    const { data, error } = await sb
      .from("questions")
      .update(patch)
      .eq("id", questionId)
      .select()
      .single();
    athrow(error, "Failed to update question.");
    return data;
  },

  async deleteQuestion(questionId) {
    const { error } = await sb.from("questions").delete().eq("id", questionId);
    athrow(error, "Failed to delete question.");
    return true;
  },

  /**
   * Bulk import questions from a parsed array (e.g. pasted CSV/JSON).
   * Each item: { section, topic, difficulty, question_text, option_a..d, correct_answer, explanation }
   */
  async bulkCreateQuestions(testId, items) {
    const rows = items.map((q, i) => ({
      test_id: testId,
      section: q.section,
      topic: q.topic || "General",
      difficulty: q.difficulty || "MEDIUM",
      question_text: q.question_text,
      option_a: q.option_a,
      option_b: q.option_b,
      option_c: q.option_c,
      option_d: q.option_d,
      correct_answer: q.correct_answer,
      explanation: q.explanation || "",
      order_index: q.order_index != null ? q.order_index : i,
    }));
    const { data, error } = await sb.from("questions").insert(rows).select();
    athrow(error, "Failed to import questions.");
    return data || [];
  },

  // ---------------- Students & access ----------------

  async listStudents() {
    const { data, error } = await sb
      .from("profiles")
      .select("*")
      .eq("role", "student")
      .order("student_id", { ascending: true });
    athrow(error, "Failed to load students.");
    return data || [];
  },

  async listAccessForTest(testId) {
    const { data, error } = await sb
      .from("test_access")
      .select("*, profiles:student_id ( id, student_id, name )")
      .eq("test_id", testId);
    athrow(error, "Failed to load access list.");
    return data || [];
  },

  async grantAccess(testId, studentProfileId) {
    const { error } = await sb
      .from("test_access")
      .insert({ test_id: testId, student_id: studentProfileId });
    athrow(error, "Failed to grant access.");
    return true;
  },

  async revokeAccess(testId, studentProfileId) {
    const { error } = await sb
      .from("test_access")
      .delete()
      .eq("test_id", testId)
      .eq("student_id", studentProfileId);
    athrow(error, "Failed to revoke access.");
    return true;
  },

  /**
   * Creates a new student login (student_id + password) via the
   * `create-student` Edge Function, which uses the service_role key
   * server-side — this can never be done safely from the browser directly.
   * Deploy the function in /create-student before using this.
   */
  async createStudent({ student_id, name, password }) {
    const { data, error } = await sb.functions.invoke("create-student", {
      body: { student_id, name, password },
    });
    if (error) throw new Error(error.message || "Failed to create student account.");
    if (data && data.error) throw new Error(data.error);
    return data;
  },

  // ---------------- Attempts overview ----------------

  async listAllAttempts() {
    const { data, error } = await sb
      .from("attempts")
      .select("*, profiles:student_id ( student_id, name ), mock_tests:test_id ( title )")
      .order("started_at", { ascending: false });
    athrow(error, "Failed to load attempts.");
    return data || [];
  },
};

window.AdminApi = AdminApi;
