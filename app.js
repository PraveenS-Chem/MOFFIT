/**
 * MOFFit — app.js
 * Data layer & dynamic rendering engine
 *
 * Architecture designed for easy back-end swap:
 *   - Replace loadMOFs() body to point at Supabase, CoRE-MOF export,
 *     CrossRef API, or Semantic Scholar API without touching any UI code.
 *
 * Public surface:
 *   window.MOFFIT.loadMOFs()
 *   window.MOFFIT.filterMOFs()
 *   window.MOFFIT.searchMOFs()
 *   window.MOFFIT.sortMOFs()
 *   window.MOFFIT.generateRec()   ← replaces the inline generateRec() in HTML
 */

'use strict';

/* ═══════════════════════════════════════════════════
   CONFIGURATION — swap data source here only
═══════════════════════════════════════════════════ */
const CONFIG = {
  /** Primary data source — swap this URL for Supabase endpoint, CoRE-MOF
   *  REST export, or any JSON API that returns the same schema. */
  dataUrl: 'mofs.json',

  /** Future hook: set to true and populate supabaseUrl/supabaseKey
   *  to route through Supabase instead of mofs.json. */
  useSupabase: false,
  supabaseUrl: '',
  supabaseKey: '',

  /** Stagger delay (ms) between card entrance animations */
  cardStaggerMs: 100,

  /** Debounce delay (ms) for search input */
  searchDebounceMs: 220,
};

/* ═══════════════════════════════════════════════════
   IN-MEMORY DATABASE
═══════════════════════════════════════════════════ */
const DB = {
  /** Full dataset loaded from source — never mutated after load */
  all: [],
  /** Currently displayed subset after filters/search/sort */
  active: [],
};

/* ═══════════════════════════════════════════════════
   SCORE → VISUAL PALETTE MAPPING
   Keeps card coloring consistent with the hardcoded originals.
═══════════════════════════════════════════════════ */
const PALETTES = [
  // score ≥ 9.4 — cyan/blue (top tier)
  { min: 9.4, ring: '#00d4ff', ringEnd: '#3b82f6', ringBg: 'rgba(0,212,255,0.1)',  scoreColor: '#00d4ff', tagBg: 'rgba(0,212,255,0.1)',   tagBorder: 'rgba(0,212,255,0.3)',   tagColor: '#67e8f9' },
  // score ≥ 9.0 — purple/blue
  { min: 9.0, ring: '#8b5cf6', ringEnd: '#3b82f6', ringBg: 'rgba(139,92,246,0.15)', scoreColor: '#a78bfa', tagBg: 'rgba(59,130,246,0.1)',  tagBorder: 'rgba(59,130,246,0.3)',  tagColor: '#93c5fd' },
  // score ≥ 8.5 — teal/cyan
  { min: 8.5, ring: '#14b8a6', ringEnd: '#00d4ff', ringBg: 'rgba(20,184,166,0.15)', scoreColor: '#2dd4bf', tagBg: 'rgba(20,184,166,0.1)',  tagBorder: 'rgba(20,184,166,0.3)',  tagColor: '#2dd4bf' },
  // score ≥ 8.0 — orange/yellow (catalysis vibe)
  { min: 8.0, ring: '#f97316', ringEnd: '#eab308', ringBg: 'rgba(249,115,22,0.12)', scoreColor: '#fb923c', tagBg: 'rgba(249,115,22,0.08)', tagBorder: 'rgba(249,115,22,0.25)', tagColor: '#fb923c' },
  // score < 8.0 — purple/pink (base)
  { min: 0,   ring: '#8b5cf6', ringEnd: '#ec4899', ringBg: 'rgba(139,92,246,0.12)', scoreColor: '#c084fc', tagBg: 'rgba(139,92,246,0.1)',  tagBorder: 'rgba(139,92,246,0.25)', tagColor: '#c084fc' },
];

function getPalette(score) {
  return PALETTES.find(p => score >= p.min);
}

/* ═══════════════════════════════════════════════════
   BAR METRICS — derive normalised bar widths
═══════════════════════════════════════════════════ */
function getBarMetrics(mof) {
  // Surface: MIL-101 at 5900 m²/g ≈ 100 %
  const surface  = Math.min(Math.round((mof.surfaceArea / 5900) * 100), 99);
  // Stability: map text label → % for the bar
  const stabMap  = { 'Excellent': 95, 'High': 82, 'Good': 65, 'Moderate': 55, 'Low': 30 };
  const stability = stabMap[mof.waterStability] ?? 50;
  // Porosity: poreVolume / 3.86 (MIL-101 max)
  const porosity = Math.min(Math.round((mof.poreVolume / 3.86) * 100), 99);
  return { surface, stability, porosity };
}

/* ═══════════════════════════════════════════════════
   SVG RING — dynamic stroke-dashoffset from score
═══════════════════════════════════════════════════ */
function buildRingSVG(mof, palette, uid) {
  const CIRCUMFERENCE = 138.2; // 2π × r=22
  const dashOffset    = CIRCUMFERENCE - (mof.recommendationScore / 10) * CIRCUMFERENCE;
  const gradId        = `g-${uid}`;

  return `
    <svg width="52" height="52" viewBox="0 0 56 56" aria-hidden="true">
      <circle cx="28" cy="28" r="22" fill="none" stroke="${palette.ringBg}" stroke-width="3"/>
      <circle cx="28" cy="28" r="22" fill="none" stroke="url(#${gradId})"
              stroke-width="3" stroke-linecap="round"
              stroke-dasharray="${CIRCUMFERENCE}"
              stroke-dashoffset="${dashOffset.toFixed(1)}"/>
      <defs>
        <linearGradient id="${gradId}" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stop-color="${palette.ring}"/>
          <stop offset="100%" stop-color="${palette.ringEnd}"/>
        </linearGradient>
      </defs>
    </svg>`.trim();
}

/* ═══════════════════════════════════════════════════
   BAR GRADIENTS — consistent with original design
═══════════════════════════════════════════════════ */
const BAR_GRADIENTS = {
  surface:   'linear-gradient(90deg,var(--cyan),var(--blue))',
  stability: 'linear-gradient(90deg,var(--purple),#ec4899)',
  porosity:  'linear-gradient(90deg,var(--teal),var(--cyan))',
};

/* ═══════════════════════════════════════════════════
   CARD TEMPLATE — mirrors exact hardcoded markup
═══════════════════════════════════════════════════ */
function buildCardHTML(mof, index) {
  const palette  = getPalette(mof.recommendationScore);
  const bars     = getBarMetrics(mof);
  const uid      = `${mof.id}-${index}`;
  const ringSVG  = buildRingSVG(mof, palette, uid);
  const primaryApp = Array.isArray(mof.applicationTypes) ? mof.applicationTypes[0] : mof.applicationTypes;

  return `
<article class="mof-card"
         role="listitem"
         tabindex="0"
         aria-label="${mof.name} MOF card"
         data-id="${mof.id}"
         data-score="${mof.recommendationScore}">

  <div class="card-header-row">
    <div>
      <div class="mof-name">${mof.name}</div>
      <div class="mof-formula">${mof.formula}</div>
    </div>
    <div class="score-ring" aria-label="AI score ${mof.recommendationScore} out of 10">
      ${ringSVG}
      <div class="score-val" style="color:${palette.scoreColor}">${mof.recommendationScore}</div>
    </div>
  </div>

  <span class="mof-app-tag"
        style="background:${palette.tagBg};border-color:${palette.tagBorder};color:${palette.tagColor};">
    ${primaryApp}
  </span>

  <div class="card-props">
    <div class="prop">
      <div class="prop-label">Surface Area</div>
      <div class="prop-val"><strong>${mof.surfaceArea.toLocaleString()}</strong> m²/g</div>
    </div>
    <div class="prop">
      <div class="prop-label">Pore Volume</div>
      <div class="prop-val"><strong>${mof.poreVolume.toFixed(2)}</strong> cm³/g</div>
    </div>
    <div class="prop">
      <div class="prop-label">Stability</div>
      <div class="prop-val"><strong>${mof.waterStability}</strong></div>
    </div>
    <div class="prop">
      <div class="prop-label">Pore Size</div>
      <div class="prop-val"><strong>${mof.poreSize}</strong> Å</div>
    </div>
  </div>

  <div class="bar-wrap" aria-label="Property scores">
    <div class="bar-row">
      <span class="bar-label">Surface</span>
      <div class="bar-track">
        <div class="bar-fill" style="width:${bars.surface}%;background:${BAR_GRADIENTS.surface}"></div>
      </div>
      <span class="bar-pct">${bars.surface}%</span>
    </div>
    <div class="bar-row">
      <span class="bar-label">Stability</span>
      <div class="bar-track">
        <div class="bar-fill" style="width:${bars.stability}%;background:${BAR_GRADIENTS.stability}"></div>
      </div>
      <span class="bar-pct">${bars.stability}%</span>
    </div>
    <div class="bar-row">
      <span class="bar-label">Porosity</span>
      <div class="bar-track">
        <div class="bar-fill" style="width:${bars.porosity}%;background:${BAR_GRADIENTS.porosity}"></div>
      </div>
      <span class="bar-pct">${bars.porosity}%</span>
    </div>
  </div>

  <div class="ai-rec">
    <span class="ai-rec-icon" aria-hidden="true">✦</span>
    <span class="ai-rec-text">${mof.description}</span>
  </div>

</article>`.trim();
}

/* ═══════════════════════════════════════════════════
   STATE TEMPLATES — loading / error / empty
═══════════════════════════════════════════════════ */
function showLoadingState(grid) {
  grid.innerHTML = `
    <div class="mof-state-msg" role="status" aria-live="polite" style="grid-column:1/-1;text-align:center;padding:48px 0;">
      <div style="font-size:28px;margin-bottom:12px;animation:pulse-dot 1.2s infinite;">⬡</div>
      <div style="font-family:var(--font-mono);font-size:12px;color:var(--cyan);letter-spacing:0.12em;text-transform:uppercase;">
        Loading MOF database…
      </div>
    </div>`.trim();
}

function showErrorState(grid, message) {
  grid.innerHTML = `
    <div class="mof-state-msg" role="alert" style="grid-column:1/-1;text-align:center;padding:48px 0;">
      <div style="font-size:28px;margin-bottom:12px;">⚠</div>
      <div style="font-family:var(--font-mono);font-size:12px;color:#f87171;letter-spacing:0.08em;">
        Failed to load MOF data
      </div>
      <div style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted);margin-top:8px;">
        ${message}
      </div>
      <button onclick="MOFFIT.loadMOFs()" style="
        margin-top:20px;font-family:var(--font-mono);font-size:11px;
        color:var(--cyan);background:transparent;border:1px solid var(--border-bright);
        border-radius:6px;padding:8px 18px;cursor:pointer;letter-spacing:0.1em;">
        ↺ RETRY
      </button>
    </div>`.trim();
}

function showEmptyState(grid) {
  grid.innerHTML = `
    <div class="mof-state-msg" role="status" aria-live="polite" style="grid-column:1/-1;text-align:center;padding:48px 0;">
      <div style="font-size:28px;margin-bottom:12px;">◌</div>
      <div style="font-family:var(--font-display);font-size:16px;color:var(--text-secondary);margin-bottom:8px;">
        No MOFs match your query
      </div>
      <div style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);letter-spacing:0.06em;">
        Try adjusting filters or clearing the search
      </div>
      <button onclick="MOFFIT.resetFilters()" style="
        margin-top:20px;font-family:var(--font-mono);font-size:11px;
        color:var(--cyan);background:transparent;border:1px solid var(--border-bright);
        border-radius:6px;padding:8px 18px;cursor:pointer;letter-spacing:0.1em;">
        ↺ RESET FILTERS
      </button>
    </div>`.trim();
}

/* ═══════════════════════════════════════════════════
   RENDER CARDS — with stagger animation
═══════════════════════════════════════════════════ */
function renderCards(mofs, grid) {
  if (!mofs.length) {
    showEmptyState(grid);
    return;
  }

  grid.innerHTML = mofs.map((mof, i) => buildCardHTML(mof, i)).join('');

  // Stagger entrance animation — mirrors original generateRec() logic
  const cards = grid.querySelectorAll('.mof-card');
  cards.forEach((card, i) => {
    card.style.opacity   = '0';
    card.style.transform = 'translateY(20px)';
    card.style.transition = 'none';
    setTimeout(() => {
      card.style.transition = 'opacity 0.5s ease, transform 0.5s ease, border-color 0.35s, box-shadow 0.35s';
      card.style.opacity    = '1';
      card.style.transform  = 'translateY(0)';
    }, i * CONFIG.cardStaggerMs + 80);
  });
}

/* ═══════════════════════════════════════════════════
   FILTER — application type + metal node
═══════════════════════════════════════════════════ */
function filterMOFs(mofs, appType, metalNode) {
  return mofs.filter(mof => {
    const matchesApp = (!appType || appType === 'all')
      ? true
      : (Array.isArray(mof.applicationTypes)
          ? mof.applicationTypes.some(a => a.toLowerCase().includes(appType.toLowerCase()))
          : mof.applicationTypes.toLowerCase().includes(appType.toLowerCase()));

    const matchesMetal = (!metalNode || metalNode === 'Any')
      ? true
      : mof.metalNode.toLowerCase().includes(metalNode.toLowerCase());

    return matchesApp && matchesMetal;
  });
}

/* ═══════════════════════════════════════════════════
   SEARCH — name, formula, description, metal node
═══════════════════════════════════════════════════ */
function searchMOFs(mofs, query) {
  if (!query || !query.trim()) return mofs;
  const q = query.trim().toLowerCase();
  return mofs.filter(mof =>
    mof.name.toLowerCase().includes(q)        ||
    mof.formula.toLowerCase().includes(q)     ||
    mof.metalNode.toLowerCase().includes(q)   ||
    mof.description.toLowerCase().includes(q) ||
    (Array.isArray(mof.applicationTypes)
      ? mof.applicationTypes.some(a => a.toLowerCase().includes(q))
      : mof.applicationTypes.toLowerCase().includes(q))
  );
}

/* ═══════════════════════════════════════════════════
   SORT — by recommendation score, descending
═══════════════════════════════════════════════════ */
function sortMOFs(mofs) {
  return [...mofs].sort((a, b) => b.recommendationScore - a.recommendationScore);
}

/* ═══════════════════════════════════════════════════
   APPLY PIPELINE — filter → search → sort → render
═══════════════════════════════════════════════════ */
function applyPipeline() {
  const grid      = document.getElementById('results-grid');
  const appType   = document.getElementById('app-type')?.value   ?? '';
  const metalNode = document.getElementById('metal-node')?.value ?? 'Any';
  const query     = document.getElementById('mof-search')?.value ?? '';

  let results = filterMOFs(DB.all, appType, metalNode);
  results     = searchMOFs(results, query);
  results     = sortMOFs(results);

  DB.active = results;
  renderCards(results, grid);
  setTimeout(() => grid.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
}

/* ═══════════════════════════════════════════════════
   LOAD MOFs — async data fetching
   ─────────────────────────────────────────────────
   TO SWAP DATA SOURCE:
     Option A — Supabase:
       const { data } = await supabaseClient.from('mofs').select('*');
       return data;
     Option B — CoRE-MOF REST API:
       const res = await fetch('https://api.core-mof.org/v1/mofs?limit=30');
       return res.json();
     Option C — CrossRef / Semantic Scholar wrapper:
       see your API adapter module; return normalised records.
═══════════════════════════════════════════════════ */
async function loadMOFs() {
  const grid = document.getElementById('results-grid');
  if (!grid) return;

  showLoadingState(grid);

  try {
    const response = await fetch(CONFIG.dataUrl);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} — ${response.statusText}`);
    }

    const data = await response.json();

    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('Dataset is empty or malformed.');
    }

    DB.all = data;
    applyPipeline();

  } catch (err) {
    console.error('[MOFFit] Failed to load MOF dataset:', err);
    showErrorState(grid, err.message);
  }
}

/* ═══════════════════════════════════════════════════
   RESET FILTERS — clears all controls and re-renders
═══════════════════════════════════════════════════ */
function resetFilters() {
  const appSel   = document.getElementById('app-type');
  const metalSel = document.getElementById('metal-node');
  const searchIn = document.getElementById('mof-search');
  if (appSel)   appSel.selectedIndex   = 0;
  if (metalSel) metalSel.selectedIndex = 0;
  if (searchIn) searchIn.value         = '';
  applyPipeline();
}

/* ═══════════════════════════════════════════════════
   GENERATE RECOMMENDATION ANIMATION
   Replaces the inline generateRec() that was in the HTML.
   Called by the "Generate AI Recommendation" button.
═══════════════════════════════════════════════════ */
function generateRec() {
  applyPipeline();
}

/* ═══════════════════════════════════════════════════
   DEBOUNCE HELPER (local — does not depend on the
   one defined in the HTML's inline <script>)
═══════════════════════════════════════════════════ */
function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

/* ═══════════════════════════════════════════════════
   WIRE UP CONTROLS
═══════════════════════════════════════════════════ */
function wireControls() {
  // Live search with debounce
  const searchInput = document.getElementById('mof-search');
  if (searchInput) {
    searchInput.addEventListener('input', debounce(applyPipeline, CONFIG.searchDebounceMs));
  }

  // Application type filter
  const appSelect = document.getElementById('app-type');
  if (appSelect) {
    appSelect.addEventListener('change', applyPipeline);
  }

  // Metal node filter
  const metalSelect = document.getElementById('metal-node');
  if (metalSelect) {
    metalSelect.addEventListener('change', applyPipeline);
  }
}

/* ═══════════════════════════════════════════════════
   PUBLIC NAMESPACE — exposed for HTML inline handlers
   and future external integrations
═══════════════════════════════════════════════════ */
window.MOFFIT = {
  loadMOFs,
  filterMOFs,
  searchMOFs,
  sortMOFs,
  generateRec,
  resetFilters,
  applyPipeline,
  /** Read-only DB access for debugging / third-party widgets */
  getAll:    () => [...DB.all],
  getActive: () => [...DB.active],
  /** CONFIG access for runtime overrides (e.g., hot-swap data URL) */
  config: CONFIG,
};

/* ═══════════════════════════════════════════════════
   BOOT
═══════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  wireControls();
  loadMOFs();
});
