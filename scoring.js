/**
 * SCORING — DISPLAY HELPERS ONLY
 * ------------------------------------------------------------------
 * Real scoring now happens server-side in the submit_attempt() Postgres
 * function (see schema.sql) so a student can never submit a fabricated
 * score. This file only keeps small helpers used to render results
 * already returned from the server.
 * ------------------------------------------------------------------
 */

function sectionColor(pct) {
  if (pct >= 70) return "success";
  if (pct >= 40) return "warning";
  return "error";
}

window.Scoring = { sectionColor };
