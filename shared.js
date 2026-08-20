/**
 * SHARED UI HELPERS
 * Navbar, toast notifications, and Supabase-backed auth helpers.
 * Requires supabase-client.js (and api.js, for pages that need it)
 * to be loaded first.
 */

let __sessionCache;

async function getSession() {
  const {
    data: { session },
  } = await sb.auth.getSession();
  __sessionCache = session;
  return session;
}

// Redirects to login.html if not authenticated. Call at the top of any
// protected student page. Returns the Supabase user (not just the session).
async function requireStudent() {
  const session = await getSession();
  if (!session) {
    window.location.href = "login.html";
    return null;
  }
  return session.user;
}

// Redirects to admin-login.html if not authenticated as an admin.
async function requireAdmin() {
  const session = await getSession();
  if (!session) {
    window.location.href = "admin-login.html";
    return null;
  }
  const profile = await Api.getCurrentProfile();
  if (!profile || profile.role !== "admin") {
    showToast("Admin access required.", "error");
    setTimeout(() => (window.location.href = "index.html"), 800);
    return null;
  }
  return profile;
}

async function signOut() {
  await sb.auth.signOut();
  window.location.href = "index.html";
}

async function renderNavbar(activePage) {
  const session = await getSession();
  const mount = document.getElementById("navbar-mount");
  if (!mount) return;

  const links = [
    { href: "mock-tests.html", label: "Mock Tests", key: "mock-tests" },
    { href: "events.html", label: "Events", key: "events" },
    { href: "about.html", label: "About", key: "about" },
  ];

  const linksHtml = links
    .map(
      (l) =>
        `<a href="${l.href}" class="${activePage === l.key ? "active" : ""}">${l.label}</a>`
    )
    .join("");

  const rightHtml = session
    ? `<a href="dashboard.html" class="btn btn-secondary">Dashboard</a><a href="#" id="navSignOut" class="btn btn-ghost" style="padding:10px 10px;">Sign out</a>`
    : `<a href="login.html" class="btn btn-primary">Log in</a>`;

  mount.innerHTML = `
    <nav class="topnav">
      <div class="topnav-inner">
        <a href="index.html" class="brand">
          <span class="brand-mark">IBA</span>
          Mock Test
        </a>
        <div class="nav-links">${linksHtml}</div>
        <div class="nav-cta">${rightHtml}</div>
        <button class="nav-toggle" id="navToggle" aria-label="Open menu">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>
      </div>
      <div id="mobileMenu" class="hidden" style="border-top:1px solid var(--border); padding:12px 20px; display:flex; flex-direction:column; gap:14px;">
        ${links.map((l) => `<a href="${l.href}" style="font-size:14px;font-weight:500;color:var(--navy);">${l.label}</a>`).join("")}
        ${session ? `<a href="dashboard.html" style="font-size:14px;font-weight:600;color:var(--accent);">Dashboard</a><a href="#" id="navSignOutMobile" style="font-size:14px;font-weight:600;color:var(--error);">Sign out</a>` : `<a href="login.html" style="font-size:14px;font-weight:600;color:var(--accent);">Log in</a>`}
      </div>
    </nav>
  `;

  const toggle = document.getElementById("navToggle");
  const menu = document.getElementById("mobileMenu");
  if (toggle && menu) {
    toggle.addEventListener("click", () => menu.classList.toggle("hidden"));
  }
  const so = document.getElementById("navSignOut");
  if (so) so.addEventListener("click", (e) => { e.preventDefault(); signOut(); });
  const som = document.getElementById("navSignOutMobile");
  if (som) som.addEventListener("click", (e) => { e.preventDefault(); signOut(); });
}

function renderFooter() {
  const mount = document.getElementById("footer-mount");
  if (!mount) return;
  mount.innerHTML = `
    <footer class="site-footer">
      <div class="container">
        <span>IBA DU Mock Test Platform</span>
        <span>Not affiliated with the Institute of Business Administration, University of Dhaka · <a href="admin-login.html" style="text-decoration:underline;">Admin</a></span>
      </div>
    </footer>
  `;
}

let toastTimeout;
function showToast(message, type = "default") {
  let el = document.getElementById("__toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "__toast";
    document.body.appendChild(el);
  }
  el.className = `toast ${type}`;
  el.textContent = message;
  el.style.display = "flex";
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    el.style.display = "none";
  }, 3200);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}

function formatDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-US", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// Derives { ENGLISH: {count}, MATHEMATICS: {count}, ANALYTICAL: {count} }
// from an actual question list, since sections are now admin-authored
// per test rather than a fixed seed shape.
function sectionBreakdownFromQuestions(questions) {
  const out = { ENGLISH: { count: 0 }, MATHEMATICS: { count: 0 }, ANALYTICAL: { count: 0 } };
  (questions || []).forEach((q) => {
    if (!out[q.section]) out[q.section] = { count: 0 };
    out[q.section].count++;
  });
  return out;
}

const SECTION_LABELS = { ENGLISH: "English", MATHEMATICS: "Mathematics", ANALYTICAL: "Analytical" };
const SECTION_ORDER = ["ENGLISH", "MATHEMATICS", "ANALYTICAL"];
