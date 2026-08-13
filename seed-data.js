/**
 * SEED / DEMO DATA
 * ------------------------------------------------------------------
 * This file exists ONLY to make the static frontend runnable without
 * a backend. It simulates what /api/tests, /api/tests/:id/questions,
 * and /api/attempts would return from a real server.
 *
 * When the real backend is ready, delete this file and point
 * js/api.js at real endpoints. Nothing outside api.js should ever
 * import this file directly.
 * ------------------------------------------------------------------
 */

const SECTIONS = {
  ENGLISH: { key: "ENGLISH", label: "English", count: 30 },
  MATHEMATICS: { key: "MATHEMATICS", label: "Mathematics", count: 25 },
  ANALYTICAL: { key: "ANALYTICAL", label: "Analytical", count: 15 },
};

const SECTION_ORDER = ["ENGLISH", "MATHEMATICS", "ANALYTICAL"];

// ---- Topic pools per section (used to tag demo questions) ----------
const TOPICS = {
  ENGLISH: ["Grammar", "Vocabulary", "Sentence Correction", "Reading Comprehension", "Synonyms/Antonyms", "Usage"],
  MATHEMATICS: ["Arithmetic", "Algebra", "Geometry", "Percentage", "Ratio & Proportion", "Profit & Loss", "Time & Work", "Number System"],
  ANALYTICAL: ["Logical Reasoning", "Sequence", "Arrangement", "Deduction", "Data Interpretation"],
};

const DIFFICULTIES = ["EASY", "MEDIUM", "HARD"];

// ---- Deterministic pseudo-question generator ------------------------
// Produces realistic-shaped MCQs so the UI/engine can be fully tested.
// Replace with real content from the question bank once backend exists.
function buildQuestion(section, index, topic, difficulty) {
  const id = `${section}-${String(index).padStart(3, "0")}`;
  const correctIdx = (index * 7) % 4; // deterministic but varied
  const letters = ["A", "B", "C", "D"];
  const correct = letters[correctIdx];

  const templates = {
    ENGLISH: {
      q: `Choose the option that best completes the sentence. (Topic: ${topic}, Q${index})`,
      opts: ["Option A phrasing", "Option B phrasing", "Option C phrasing", "Option D phrasing"],
      explanation: `The correct choice follows standard ${topic.toLowerCase()} rules applicable to this sentence structure.`,
    },
    MATHEMATICS: {
      q: `Solve the following problem. (Topic: ${topic}, Q${index})`,
      opts: ["Value A", "Value B", "Value C", "Value D"],
      explanation: `Applying ${topic.toLowerCase()} principles yields this result step by step.`,
    },
    ANALYTICAL: {
      q: `Identify the correct pattern or conclusion. (Topic: ${topic}, Q${index})`,
      opts: ["Conclusion A", "Conclusion B", "Conclusion C", "Conclusion D"],
      explanation: `Working through the ${topic.toLowerCase()} logic step by step leads to this answer.`,
    },
  };

  const t = templates[section];

  return {
    id,
    section,
    topic,
    subtopic: null,
    difficulty,
    question_text: t.q,
    options: {
      A: t.opts[0],
      B: t.opts[1],
      C: t.opts[2],
      D: t.opts[3],
    },
    correct_answer: correct,
    explanation: t.explanation,
  };
}

function generateSectionQuestions(section) {
  const { count } = SECTIONS[section];
  const topics = TOPICS[section];
  const questions = [];
  for (let i = 1; i <= count; i++) {
    const topic = topics[i % topics.length];
    const difficulty = DIFFICULTIES[i % DIFFICULTIES.length];
    questions.push(buildQuestion(section, i, topic, difficulty));
  }
  return questions;
}

const ALL_QUESTIONS = SECTION_ORDER.flatMap(generateSectionQuestions);

const MOCK_TEST = {
  id: "test-01",
  title: "IBA DU Full Mock Test 01",
  description:
    "A full-length simulation of the IBA DU admission test: 30 English, 25 Mathematics, and 15 Analytical questions in 70 total.",
  test_number: 1,
  duration_minutes: 75,
  published: true,
  section_breakdown: SECTIONS,
  question_ids: ALL_QUESTIONS.map((q) => q.id),
};

const MOCK_TESTS = [MOCK_TEST];

// Exposed as a global for the plain-HTML/JS setup (no bundler).
window.__SEED__ = {
  SECTIONS,
  SECTION_ORDER,
  TOPICS,
  MOCK_TESTS,
  ALL_QUESTIONS,
};
