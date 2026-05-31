/**
 * MOFFit — app.js  v5.0
 * New features:
 *   • MOF Comparison Tool  — select up to 3 MOFs, side-by-side radar + table
 *   • Property Range Filter — dual-handle sliders for surfaceArea, poreVolume,
 *                             poreSize, thermalStability, recommendationScore
 */
'use strict';

/* ════════════════════════════════════════════
   CONFIG
════════════════════════════════════════════ */
const CONFIG = {
  dataUrl:          './mofs.json',
  cardStaggerMs:    80,
  searchDebounceMs: 220,
};

/* ════════════════════════════════════════════
   IN-MEMORY DB
════════════════════════════════════════════ */
const DB = {
  all:      [],
  active:   [],
  selected: null,
  revealed: false,
  /* Comparison: up to 3 MOF ids */
  compare:  new Set(),
};

/* ════════════════════════════════════════════
   PROPERTY RANGE STATE
   min/max derived from dataset after load.
════════════════════════════════════════════ */
const RANGES = {
  surfaceArea:         { min:0, max:6000, lo:0, hi:6000 },
  poreVolume:          { min:0, max:4.0,  lo:0, hi:4.0  },
  thermalStability:    { min:0, max:600,  lo:0, hi:600  },
  recommendationScore: { min:7, max:10,   lo:7, hi:10   },
};

/* ════════════════════════════════════════════
   METAL VISUALISATION
════════════════════════════════════════════ */
const METAL_VIZ = {
  'Copper (Cu)':    { color:'#f97316', color2:'#eab308', symbol:'Cu', orbitals:[2,8,1],    topology:'paddlewheel' },
  'Zinc (Zn)':      { color:'#00d4ff', color2:'#3b82f6', symbol:'Zn', orbitals:[2,8,2],    topology:'sodalite'    },
  'Zirconium (Zr)': { color:'#8b5cf6', color2:'#a78bfa', symbol:'Zr', orbitals:[2,8,10,2], topology:'fcu'         },
  'Iron (Fe)':      { color:'#ef4444', color2:'#f97316', symbol:'Fe', orbitals:[2,8,6,2],  topology:'mil'         },
  'Chromium (Cr)':  { color:'#14b8a6', color2:'#00d4ff', symbol:'Cr', orbitals:[2,8,6],    topology:'mxb'         },
  'Aluminum (Al)':  { color:'#a78bfa', color2:'#ec4899', symbol:'Al', orbitals:[2,8,3],    topology:'rod'         },
  'Titanium (Ti)':  { color:'#2dd4bf', color2:'#14b8a6', symbol:'Ti', orbitals:[2,8,10,2], topology:'fcu'         },
  'Cobalt (Co)':    { color:'#60a5fa', color2:'#8b5cf6', symbol:'Co', orbitals:[2,8,9],    topology:'sodalite'    },
  'Magnesium (Mg)': { color:'#34d399', color2:'#00d4ff', symbol:'Mg', orbitals:[2,8,2],    topology:'rod'         },
};
function getMetalViz(m) { return METAL_VIZ[m] || METAL_VIZ['Zinc (Zn)']; }

/* ════════════════════════════════════════════
   PALETTES
════════════════════════════════════════════ */
const PALETTES = [
  { min:9.4, ring:'#00d4ff', ringEnd:'#3b82f6', ringBg:'rgba(0,212,255,0.1)',   scoreColor:'#00d4ff', tagBg:'rgba(0,212,255,0.1)',   tagBorder:'rgba(0,212,255,0.3)',   tagColor:'#67e8f9' },
  { min:9.0, ring:'#8b5cf6', ringEnd:'#3b82f6', ringBg:'rgba(139,92,246,0.15)', scoreColor:'#a78bfa', tagBg:'rgba(59,130,246,0.1)',  tagBorder:'rgba(59,130,246,0.3)',  tagColor:'#93c5fd' },
  { min:8.5, ring:'#14b8a6', ringEnd:'#00d4ff', ringBg:'rgba(20,184,166,0.15)', scoreColor:'#2dd4bf', tagBg:'rgba(20,184,166,0.1)',  tagBorder:'rgba(20,184,166,0.3)',  tagColor:'#2dd4bf' },
  { min:8.0, ring:'#f97316', ringEnd:'#eab308', ringBg:'rgba(249,115,22,0.12)', scoreColor:'#fb923c', tagBg:'rgba(249,115,22,0.08)', tagBorder:'rgba(249,115,22,0.25)', tagColor:'#fb923c' },
  { min:0,   ring:'#8b5cf6', ringEnd:'#ec4899', ringBg:'rgba(139,92,246,0.12)', scoreColor:'#c084fc', tagBg:'rgba(139,92,246,0.1)',  tagBorder:'rgba(139,92,246,0.25)', tagColor:'#c084fc' },
];
function getPalette(s) { return PALETTES.find(p => s >= p.min); }

/* ════════════════════════════════════════════
   BAR METRICS
════════════════════════════════════════════ */
function getBarMetrics(mof) {
  const surface   = Math.min(Math.round((mof.surfaceArea / 5900) * 100), 99);
  const stabMap   = { Excellent:95, High:82, Good:65, Moderate:55, Low:30 };
  const stability = stabMap[mof.waterStability] ?? 50;
  const porosity  = Math.min(Math.round((mof.poreVolume / 3.86) * 100), 99);
  return { surface, stability, porosity };
}

/* ════════════════════════════════════════════
   SVG RING
════════════════════════════════════════════ */
function buildRingSVG(mof, palette, uid) {
  const C = 138.2, offset = C - (mof.recommendationScore / 10) * C, gid = `g-${uid}`;
  return `<svg width="52" height="52" viewBox="0 0 56 56" aria-hidden="true">
    <circle cx="28" cy="28" r="22" fill="none" stroke="${palette.ringBg}" stroke-width="3"/>
    <circle cx="28" cy="28" r="22" fill="none" stroke="url(#${gid})" stroke-width="3"
            stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${offset.toFixed(1)}"/>
    <defs><linearGradient id="${gid}" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${palette.ring}"/>
      <stop offset="100%" stop-color="${palette.ringEnd}"/>
    </linearGradient></defs></svg>`;
}

const BAR_GRADIENTS = {
  surface:   'linear-gradient(90deg,var(--cyan),var(--blue))',
  stability: 'linear-gradient(90deg,var(--purple),#ec4899)',
  porosity:  'linear-gradient(90deg,var(--teal),var(--cyan))',
};

/* ════════════════════════════════════════════
   CARD TEMPLATE
════════════════════════════════════════════ */
function buildCardHTML(mof, index) {
  const palette    = getPalette(mof.recommendationScore);
  const bars       = getBarMetrics(mof);
  const uid        = `${mof.id}-${index}`;
  const ringSVG    = buildRingSVG(mof, palette, uid);
  const primaryApp = Array.isArray(mof.applicationTypes) ? mof.applicationTypes[0] : mof.applicationTypes;
  const mv         = getMetalViz(mof.metalNode);
  const inCompare  = DB.compare.has(mof.id);

  return `
<article class="mof-card${inCompare ? ' mof-card--comparing' : ''}" role="listitem" tabindex="0"
         aria-label="${mof.name} — tap to visualize"
         data-id="${mof.id}"
         onclick="MOFFIT.selectMOF('${mof.id}')"
         onkeydown="if(event.key==='Enter'||event.key===' ')MOFFIT.selectMOF('${mof.id}')">

  <!-- Compare checkbox -->
  <button class="compare-toggle${inCompare ? ' active' : ''}"
          aria-label="${inCompare ? 'Remove from comparison' : 'Add to comparison'}"
          aria-pressed="${inCompare}"
          onclick="event.stopPropagation(); MOFFIT.toggleCompare('${mof.id}')">
    ${inCompare ? '✓' : '+'}
  </button>

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

  <span class="mof-app-tag" style="background:${palette.tagBg};border-color:${palette.tagBorder};color:${palette.tagColor};">
    ${primaryApp}
  </span>

  <div class="card-props">
    <div class="prop"><div class="prop-label">Surface Area</div><div class="prop-val"><strong>${mof.surfaceArea.toLocaleString()}</strong> m²/g</div></div>
    <div class="prop"><div class="prop-label">Pore Volume</div><div class="prop-val"><strong>${mof.poreVolume.toFixed(2)}</strong> cm³/g</div></div>
    <div class="prop"><div class="prop-label">Stability</div><div class="prop-val"><strong>${mof.waterStability}</strong></div></div>
    <div class="prop"><div class="prop-label">Pore Size</div><div class="prop-val"><strong>${mof.poreSize}</strong> Å</div></div>
  </div>

  <div class="bar-wrap">
    <div class="bar-row"><span class="bar-label">Surface</span><div class="bar-track"><div class="bar-fill" style="width:${bars.surface}%;background:${BAR_GRADIENTS.surface}"></div></div><span class="bar-pct">${bars.surface}%</span></div>
    <div class="bar-row"><span class="bar-label">Stability</span><div class="bar-track"><div class="bar-fill" style="width:${bars.stability}%;background:${BAR_GRADIENTS.stability}"></div></div><span class="bar-pct">${bars.stability}%</span></div>
    <div class="bar-row"><span class="bar-label">Porosity</span><div class="bar-track"><div class="bar-fill" style="width:${bars.porosity}%;background:${BAR_GRADIENTS.porosity}"></div></div><span class="bar-pct">${bars.porosity}%</span></div>
  </div>

  <div class="ai-rec">
    <span class="ai-rec-icon" aria-hidden="true">✦</span>
    <span class="ai-rec-text">${mof.description}</span>
  </div>

  <div style="margin-top:10px;font-family:var(--font-mono);font-size:9px;color:${mv.color};
              letter-spacing:0.1em;opacity:0.7;display:flex;align-items:center;gap:6px;">
    <span style="width:4px;height:4px;border-radius:50%;background:${mv.color};display:inline-block;"></span>
    TAP TO VISUALIZE · + TO COMPARE
  </div>
</article>`.trim();
}

/* ════════════════════════════════════════════
   STATE DISPLAYS
════════════════════════════════════════════ */
function showPromptState(grid) {
  grid.innerHTML = `
    <div style="grid-column:1/-1;text-align:center;padding:56px 24px;">
      <div style="font-size:40px;margin-bottom:16px;opacity:0.35;">⬡</div>
      <div style="font-family:var(--font-display);font-size:20px;font-weight:700;color:var(--text-secondary);margin-bottom:10px;">Configure your query</div>
      <div style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);letter-spacing:0.08em;max-width:280px;margin:0 auto 28px;line-height:1.6;">
        Set filters or property ranges, then click Generate AI Recommendation
      </div>
      <div style="font-family:var(--font-mono);font-size:10px;color:var(--cyan);letter-spacing:0.12em;display:flex;align-items:center;justify-content:center;gap:8px;">
        <span style="width:6px;height:6px;border-radius:50%;background:var(--cyan);display:inline-block;animation:pulse-dot 1.5s infinite;"></span>
        Awaiting query parameters
      </div>
    </div>`;
}

function showLoadingState(grid) {
  grid.innerHTML = `
    <div style="grid-column:1/-1;text-align:center;padding:48px 0;">
      <div style="font-size:28px;margin-bottom:12px;animation:pulse-dot 1.2s infinite;">⬡</div>
      <div style="font-family:var(--font-mono);font-size:12px;color:var(--cyan);letter-spacing:0.12em;text-transform:uppercase;">Loading MOF database…</div>
    </div>`;
}

function showErrorState(grid, message) {
  grid.innerHTML = `
    <div style="grid-column:1/-1;text-align:center;padding:48px 0;">
      <div style="font-size:28px;margin-bottom:12px;">⚠</div>
      <div style="font-family:var(--font-mono);font-size:12px;color:#f87171;">Failed to load MOF data</div>
      <div style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted);margin-top:8px;">${message}</div>
      <button onclick="MOFFIT.loadMOFs()" style="margin-top:20px;font-family:var(--font-mono);font-size:11px;color:var(--cyan);background:transparent;border:1px solid var(--border-bright);border-radius:6px;padding:8px 18px;cursor:pointer;">↺ RETRY</button>
    </div>`;
}

function showEmptyState(grid) {
  grid.innerHTML = `
    <div style="grid-column:1/-1;text-align:center;padding:48px 0;">
      <div style="font-size:28px;margin-bottom:12px;">◌</div>
      <div style="font-family:var(--font-display);font-size:16px;color:var(--text-secondary);margin-bottom:8px;">No MOFs match your query</div>
      <div style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);">Adjust filters or widen the property ranges</div>
      <button onclick="MOFFIT.resetFilters()" style="margin-top:20px;font-family:var(--font-mono);font-size:11px;color:var(--cyan);background:transparent;border:1px solid var(--border-bright);border-radius:6px;padding:8px 18px;cursor:pointer;">↺ RESET ALL</button>
    </div>`;
}

/* ════════════════════════════════════════════
   RENDER CARDS
════════════════════════════════════════════ */
function renderCards(mofs, grid) {
  if (!mofs.length) { showEmptyState(grid); updateCompareBar(); return; }

  grid.innerHTML = mofs.map((mof, i) => buildCardHTML(mof, i)).join('');

  grid.querySelectorAll('.mof-card').forEach((card, i) => {
    card.style.opacity   = '0';
    card.style.transform = 'translateY(20px)';
    card.style.transition = 'none';
    setTimeout(() => {
      card.style.transition = 'opacity 0.5s ease, transform 0.5s ease, border-color 0.35s, box-shadow 0.35s';
      card.style.opacity    = '1';
      card.style.transform  = 'translateY(0)';
    }, i * CONFIG.cardStaggerMs + 80);
  });

  updateMOFSelector(mofs);
  updateCompareBar();
  setTimeout(() => { if (mofs.length) selectMOF(mofs[0].id); }, 700);
}

/* ════════════════════════════════════════════
   MOF SELECTOR PANEL (above visualiser)
════════════════════════════════════════════ */
function updateMOFSelector(mofs) {
  const panel = document.getElementById('mof-selector-panel');
  if (!panel) return;
  if (!mofs?.length) { panel.style.display = 'none'; return; }
  panel.style.display = 'block';

  const buttons = mofs.map(mof => {
    const mv = getMetalViz(mof.metalNode);
    return `<button class="mof-selector-btn" data-id="${mof.id}"
              onclick="MOFFIT.selectMOF('${mof.id}')"
              style="display:flex;align-items:center;gap:8px;background:transparent;
                     border:1px solid var(--border);border-radius:8px;padding:8px 12px;
                     cursor:pointer;font-family:var(--font-mono);font-size:11px;
                     color:var(--text-secondary);transition:all 0.2s;
                     white-space:nowrap;flex-shrink:0;min-height:36px;">
              <span style="width:6px;height:6px;border-radius:50%;background:${mv.color};flex-shrink:0;"></span>
              <span>${mof.name}</span>
              <span style="color:var(--text-muted);font-size:9px;">${mof.recommendationScore}</span>
            </button>`;
  }).join('');

  panel.innerHTML = `
    <div style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted);
                letter-spacing:0.1em;text-transform:uppercase;margin-bottom:10px;
                display:flex;align-items:center;gap:8px;">
      <span style="width:16px;height:1px;background:var(--cyan);display:inline-block;"></span>
      Select MOF to Visualize
      <span style="color:var(--cyan);">(${mofs.length})</span>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:8px;">${buttons}</div>`;

  if (DB.selected) highlightSelectorBtn(DB.selected.id);
}

function highlightSelectorBtn(id) {
  document.querySelectorAll('.mof-selector-btn').forEach(b => {
    const active = b.dataset.id === id;
    b.style.borderColor = active ? 'var(--cyan)' : '';
    b.style.color       = active ? 'var(--cyan)' : '';
    b.style.background  = active ? 'rgba(0,212,255,0.06)' : '';
  });
}

/* ════════════════════════════════════════════
   SELECT MOF  (drives visualiser)
════════════════════════════════════════════ */
function selectMOF(id) {
  const mof = DB.all.find(m => m.id === id);
  if (!mof) return;
  DB.selected = mof;

  document.querySelectorAll('.mof-card').forEach(c => {
    const sel = c.dataset.id === id;
    c.style.borderColor = sel ? 'rgba(0,212,255,0.6)' : '';
    c.style.boxShadow   = sel ? '0 0 32px rgba(0,212,255,0.15)' : '';
  });

  highlightSelectorBtn(id);
  updateVizBanner(mof);
  VIZ.drawPoreStructure(mof);
  VIZ.drawPoreNetwork(mof);
  VIZ.drawOrbitalDensity(mof);

  const tryInsights = (n = 0) => {
    if (window.INSIGHTS?.loadInsights) window.INSIGHTS.loadInsights(mof);
    else if (n < 15) setTimeout(() => tryInsights(n + 1), 200);
  };
  tryInsights();
}

/* ════════════════════════════════════════════
   VIZ BANNER
════════════════════════════════════════════ */
function updateVizBanner(mof) {
  const banner = document.getElementById('viz-active-mof');
  if (!banner) return;
  const mv   = getMetalViz(mof.metalNode);
  const apps = Array.isArray(mof.applicationTypes) ? mof.applicationTypes.join(' · ') : mof.applicationTypes;

  banner.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
      <div style="width:8px;height:8px;border-radius:50%;background:${mv.color};
                  box-shadow:0 0 10px ${mv.color};flex-shrink:0;animation:pulse-dot 1.5s infinite;"></div>
      <span style="font-family:var(--font-display);font-size:16px;font-weight:700;color:var(--text-primary);">${mof.name}</span>
      <span style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted);">${mof.formula}</span>
      <span style="font-family:var(--font-mono);font-size:9px;padding:3px 8px;border-radius:4px;
                   background:rgba(0,212,255,0.08);border:1px solid rgba(0,212,255,0.2);color:var(--cyan);">
        ${mv.symbol} · ${mv.topology.toUpperCase()}
      </span>
    </div>
    <div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:8px;">
      <span style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted);">Pore: <strong style="color:${mv.color}">${mof.poreSize} Å</strong></span>
      <span style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted);">Surface: <strong style="color:${mv.color}">${mof.surfaceArea.toLocaleString()} m²/g</strong></span>
      <span style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted);">Stability: <strong style="color:${mv.color}">${mof.waterStability}</strong></span>
      <span style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted);">Score: <strong style="color:${mv.color}">${mof.recommendationScore}</strong></span>
    </div>
    <div style="font-family:var(--font-mono);font-size:9px;color:var(--text-muted);margin-top:6px;">${apps}</div>`;
  banner.style.opacity = '1';
}

/* ════════════════════════════════════════════
   VIZ ENGINE
════════════════════════════════════════════ */
const VIZ = (() => {
  const state = { viz1:{t:0,raf:null}, viz2:{t:0,raf:null,nodes:[]}, viz3:{t:0,raf:null} };
  const isMob = () => window.innerWidth < 768;

  function getCanvas(id) {
    const canvas = document.getElementById(id);
    if (!canvas) return null;
    const card = canvas.closest('.viz-card');
    canvas.width  = card ? card.clientWidth  : 300;
    canvas.height = card ? card.clientHeight : 220;
    return canvas;
  }

  function hexColor(hex) {
    const h = hex.replace('#','');
    return `${parseInt(h.substring(0,2),16)},${parseInt(h.substring(2,4),16)},${parseInt(h.substring(4,6),16)}`;
  }

  function drawPoreStructure(mof) {
    const canvas = getCanvas('viz1'); if (!canvas) return;
    const ctx = canvas.getContext('2d'), mv = getMetalViz(mof.metalNode);
    const rawP = parseFloat(String(mof.poreSize).split('–')[0]) || 9;
    const hexR = Math.max(14, Math.min(42, 14 + (rawP / 37) * 28));
    if (state.viz1.raf) cancelAnimationFrame(state.viz1.raf);
    state.viz1.t = 0;
    const lbl = document.querySelector('#vc1 .viz-card-label');
    if (lbl) lbl.textContent = `Pore Geometry · ${mof.poreSize} Å`;
    function loop() {
      state.viz1.t += 0.012; const t = state.viz1.t;
      const W = canvas.width, H = canvas.height;
      ctx.clearRect(0,0,W,H); ctx.fillStyle='#050b12'; ctx.fillRect(0,0,W,H);
      const dx=hexR*Math.sqrt(3), dy=hexR*1.5;
      const cols=Math.ceil(W/dx)+3, rows=Math.ceil(H/dy)+3;
      const maxD=Math.sqrt(W*W+H*H)/2;
      for (let row=-2; row<rows; row++) {
        for (let col=-2; col<cols; col++) {
          const x=col*dx+(row%2===0?0:dx/2), y=row*dy;
          const dist=Math.sqrt((x-W/2)**2+(y-H/2)**2);
          const alpha=Math.max(0,1-dist/maxD)*0.75;
          const pulse=Math.sin(dist*0.022-t*2)*0.5+0.5;
          ctx.beginPath();
          for (let i=0;i<6;i++){const a=Math.PI/180*(60*i-30);const px=x+hexR*Math.cos(a),py=y+hexR*Math.sin(a);i===0?ctx.moveTo(px,py):ctx.lineTo(px,py);}
          ctx.closePath();
          ctx.strokeStyle=`rgba(${hexColor(mv.color)},${alpha*(0.3+pulse*0.25)})`;
          ctx.lineWidth=0.9; ctx.stroke();
          if (dist<maxD*0.8){ctx.beginPath();ctx.arc(x,y,2*(0.6+pulse*0.6),0,Math.PI*2);ctx.fillStyle=`rgba(${hexColor(mv.color)},${alpha*(0.4+pulse*0.4)})`;ctx.fill();}
        }
      }
      const sx=W/2+Math.cos(t*0.7)*W/3;
      const sg=ctx.createRadialGradient(sx,H/2,0,sx,H/2,180);
      sg.addColorStop(0,`rgba(${hexColor(mv.color)},0.06)`); sg.addColorStop(1,`rgba(${hexColor(mv.color)},0)`);
      ctx.fillStyle=sg; ctx.fillRect(0,0,W,H);
      state.viz1.raf=requestAnimationFrame(loop);
    }
    loop();
  }

  function drawPoreNetwork(mof) {
    const canvas = getCanvas('viz2'); if (!canvas) return;
    const ctx=canvas.getContext('2d'), mv=getMetalViz(mof.metalNode);
    if (state.viz2.raf) cancelAnimationFrame(state.viz2.raf);
    state.viz2.t=0;
    const nodeCount=Math.max(8,Math.min(24,Math.round((mof.surfaceArea/5900)*24)));
    const edgeDist=Math.max(80,Math.min(200,80+(mof.poreVolume/3.86)*120));
    state.viz2.nodes=Array.from({length:nodeCount},()=>({x:Math.random(),y:Math.random(),vx:(Math.random()-0.5)*0.0008,vy:(Math.random()-0.5)*0.0008,r:2.5+Math.random()*4,phase:Math.random()*Math.PI*2}));
    const lbl=document.querySelector('#vc2 .viz-card-label');
    if (lbl) lbl.textContent=`Pore Network · ${nodeCount} nodes · Vol ${mof.poreVolume} cm³/g`;
    function loop() {
      state.viz2.t+=0.01; const t=state.viz2.t;
      const W=canvas.width, H=canvas.height;
      ctx.fillStyle='#050b12'; ctx.fillRect(0,0,W,H);
      state.viz2.nodes.forEach(n=>{n.x+=n.vx;n.y+=n.vy;if(n.x<0.05||n.x>0.95)n.vx*=-1;if(n.y<0.05||n.y>0.95)n.vy*=-1;});
      for(let i=0;i<state.viz2.nodes.length;i++){for(let j=i+1;j<state.viz2.nodes.length;j++){
        const ax=state.viz2.nodes[i].x*W,ay=state.viz2.nodes[i].y*H,bx=state.viz2.nodes[j].x*W,by=state.viz2.nodes[j].y*H;
        const d=Math.sqrt((ax-bx)**2+(ay-by)**2);
        if(d<edgeDist){const alpha=(1-d/edgeDist)*0.7;const grad=ctx.createLinearGradient(ax,ay,bx,by);grad.addColorStop(0,`rgba(${hexColor(mv.color)},${alpha})`);grad.addColorStop(1,`rgba(${hexColor(mv.color2)},${alpha})`);ctx.beginPath();ctx.moveTo(ax,ay);ctx.lineTo(bx,by);ctx.strokeStyle=grad;ctx.lineWidth=1.2;ctx.stroke();}
      }}
      state.viz2.nodes.forEach(n=>{const x=n.x*W,y=n.y*H,pulse=Math.sin(t*2+n.phase)*0.5+0.5;const grd=ctx.createRadialGradient(x,y,0,x,y,n.r*2.5);grd.addColorStop(0,`rgba(${hexColor(mv.color)},0.9)`);grd.addColorStop(1,`rgba(${hexColor(mv.color)},0)`);ctx.beginPath();ctx.arc(x,y,n.r*(0.8+pulse*0.4),0,Math.PI*2);ctx.fillStyle=grd;ctx.fill();});
      state.viz2.raf=requestAnimationFrame(loop);
    }
    loop();
  }

  function drawOrbitalDensity(mof) {
    const canvas=getCanvas('viz3'); if (!canvas) return;
    const ctx=canvas.getContext('2d'), mv=getMetalViz(mof.metalNode);
    if (state.viz3.raf) cancelAnimationFrame(state.viz3.raf);
    state.viz3.t=0;
    const speed=0.5+(mof.thermalStability/550)*0.9;
    const lbl=document.querySelector('#vc3 .viz-card-label');
    if (lbl) lbl.textContent=`${mv.symbol} Orbital · ${mof.thermalStability}°C stability`;
    function loop() {
      state.viz3.t+=0.012; const t=state.viz3.t;
      const W=canvas.width,H=canvas.height,cx=W/2,cy=H/2;
      ctx.fillStyle='rgba(5,11,18,0.22)'; ctx.fillRect(0,0,W,H);
      const baseR=isMob()?22:28, colors=[mv.color,mv.color2,'#ffffff','#a78bfa'];
      mv.orbitals.forEach((electrons,orbit)=>{
        const r=(orbit+1)*baseR, c=colors[orbit%colors.length], dir=orbit%2===0?1:-1;
        ctx.beginPath();ctx.ellipse(cx,cy,r,r*0.38,orbit*18*Math.PI/180,0,Math.PI*2);
        ctx.strokeStyle=`rgba(${hexColor(c)},${0.06+orbit*0.02})`;ctx.lineWidth=1;ctx.stroke();
        for(let e=0;e<electrons;e++){
          const angle=(e/electrons)*Math.PI*2+t*speed*dir/(orbit+1);
          const tilt=orbit*18*Math.PI/180;
          const ex=cx+r*Math.cos(angle)*Math.cos(tilt), ey=cy+r*Math.cos(angle)*Math.sin(tilt)+r*Math.sin(angle)*0.38;
          const pulse=Math.sin(t*3+e+orbit)*0.5+0.5;
          const grd=ctx.createRadialGradient(ex,ey,0,ex,ey,7);
          grd.addColorStop(0,`rgba(${hexColor(c)},0.95)`);grd.addColorStop(1,`rgba(${hexColor(c)},0)`);
          ctx.beginPath();ctx.arc(ex,ey,3.5+pulse*2.5,0,Math.PI*2);ctx.fillStyle=grd;ctx.fill();
        }
      });
      const ng=ctx.createRadialGradient(cx,cy,0,cx,cy,18);
      ng.addColorStop(0,'rgba(255,255,255,0.95)');ng.addColorStop(0.3,`rgba(${hexColor(mv.color)},0.85)`);ng.addColorStop(1,`rgba(${hexColor(mv.color)},0)`);
      ctx.beginPath();ctx.arc(cx,cy,18,0,Math.PI*2);ctx.fillStyle=ng;ctx.fill();
      ctx.font='bold 11px monospace';ctx.fillStyle='rgba(255,255,255,0.85)';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(mv.symbol,cx,cy);
      state.viz3.raf=requestAnimationFrame(loop);
    }
    loop();
  }

  return { drawPoreStructure, drawPoreNetwork, drawOrbitalDensity };
})();

/* ════════════════════════════════════════════════════════════
   ███████████████████████████████████████████████████████████
   FEATURE 1: PROPERTY RANGE FILTER
   ───────────────────────────────────────────────────────────
   Dual-handle range sliders rendered in #property-range-panel.
   Uses native <input type=range> styled to match the dark theme.
   Two overlapping inputs (lo + hi) give the dual-handle UX.
███████████████████████████████████████████████████████████ */

const RANGE_DEFS = [
  { key:'surfaceArea',         label:'Surface Area',      unit:'m²/g', step:50,   decimals:0 },
  { key:'poreVolume',          label:'Pore Volume',       unit:'cm³/g',step:0.05, decimals:2 },
  { key:'thermalStability',    label:'Thermal Stability', unit:'°C',   step:10,   decimals:0 },
  { key:'recommendationScore', label:'AI Score',          unit:'',     step:0.1,  decimals:1 },
];

function buildRangePanel() {
  const panel = document.getElementById('property-range-panel');
  if (!panel) return;

  panel.innerHTML = `
    <div class="range-panel-header">
      <span class="range-panel-title">⬡ Property Ranges</span>
      <button class="range-reset-btn" onclick="MOFFIT.resetRanges()" aria-label="Reset all property ranges">↺ Reset</button>
    </div>
    <div class="range-sliders">
      ${RANGE_DEFS.map(def => {
        const r = RANGES[def.key];
        return `
        <div class="range-group" data-key="${def.key}">
          <div class="range-label-row">
            <span class="range-label">${def.label}</span>
            <span class="range-values" id="rv-${def.key}">
              ${fmtRange(r.lo, r.hi, def)}
            </span>
          </div>
          <div class="dual-range-wrap">
            <div class="range-track">
              <div class="range-fill" id="rf-${def.key}"></div>
            </div>
            <input type="range" class="range-input range-lo" id="rlo-${def.key}"
                   min="${r.min}" max="${r.max}" step="${def.step}" value="${r.lo}"
                   aria-label="${def.label} minimum"
                   oninput="MOFFIT.onRangeInput('${def.key}','lo',this.value)">
            <input type="range" class="range-input range-hi" id="rhi-${def.key}"
                   min="${r.min}" max="${r.max}" step="${def.step}" value="${r.hi}"
                   aria-label="${def.label} maximum"
                   oninput="MOFFIT.onRangeInput('${def.key}','hi',this.value)">
          </div>
        </div>`;
      }).join('')}
    </div>`;

  // Initial fill positions
  RANGE_DEFS.forEach(def => updateRangeFill(def.key));
}

function fmtVal(v, def) {
  return def.decimals > 0 ? v.toFixed(def.decimals) : Math.round(v).toLocaleString();
}

function fmtRange(lo, hi, def) {
  return `${fmtVal(lo, def)}${def.unit} – ${fmtVal(hi, def)}${def.unit}`;
}

function updateRangeFill(key) {
  const def  = RANGE_DEFS.find(d => d.key === key);
  const r    = RANGES[key];
  const fill = document.getElementById(`rf-${key}`);
  const valEl= document.getElementById(`rv-${key}`);
  if (!fill || !def) return;

  const pct = (v) => ((v - r.min) / (r.max - r.min)) * 100;
  fill.style.left  = `${pct(r.lo)}%`;
  fill.style.width = `${pct(r.hi) - pct(r.lo)}%`;
  if (valEl) valEl.textContent = fmtRange(r.lo, r.hi, def);
}

function onRangeInput(key, handle, rawVal) {
  const r   = RANGES[key];
  const val = parseFloat(rawVal);

  if (handle === 'lo') {
    r.lo = Math.min(val, r.hi - (RANGE_DEFS.find(d=>d.key===key)?.step || 1));
    document.getElementById(`rlo-${key}`).value = r.lo;
  } else {
    r.hi = Math.max(val, r.lo + (RANGE_DEFS.find(d=>d.key===key)?.step || 1));
    document.getElementById(`rhi-${key}`).value = r.hi;
  }

  updateRangeFill(key);
  if (DB.revealed) applyPipeline(true);
}

function filterByRanges(mofs) {
  return mofs.filter(mof => {
    for (const def of RANGE_DEFS) {
      const r = RANGES[def.key];
      const v = mof[def.key];
      if (typeof v !== 'number') continue;
      if (v < r.lo || v > r.hi) return false;
    }
    return true;
  });
}

function resetRanges() {
  RANGE_DEFS.forEach(def => {
    const r = RANGES[def.key];
    r.lo = r.min; r.hi = r.max;
    const lo = document.getElementById(`rlo-${def.key}`);
    const hi = document.getElementById(`rhi-${def.key}`);
    if (lo) lo.value = r.lo;
    if (hi) hi.value = r.hi;
    updateRangeFill(def.key);
  });
  if (DB.revealed) applyPipeline(true);
}

/* ════════════════════════════════════════════════════════════
   FEATURE 2: MOF COMPARISON TOOL
   ───────────────────────────────────────────────────────────
   • Cards get a '+' toggle button.
   • Up to 3 MOFs selectable into DB.compare (Set of ids).
   • A floating compare bar appears at the bottom showing
     selected MOFs + "Compare" CTA.
   • Clicking "Compare" opens a full-screen modal with:
     – Side-by-side metric table
     – Spider/radar chart (Canvas, no external lib)
     – Scrollable on mobile
████████████████████████████████████████████████████████████ */

/* ── Toggle a MOF in/out of compare set ── */
function toggleCompare(id) {
  if (DB.compare.has(id)) {
    DB.compare.delete(id);
  } else {
    if (DB.compare.size >= 3) {
      // Remove oldest (first in iteration order)
      DB.compare.delete(DB.compare.values().next().value);
    }
    DB.compare.add(id);
  }
  // Re-render cards so toggle buttons update
  if (DB.revealed) renderCards(DB.active, document.getElementById('results-grid'));
  else updateCompareBar();
}

/* ── Floating compare bar ── */
function updateCompareBar() {
  const bar = document.getElementById('compare-bar');
  if (!bar) return;

  if (DB.compare.size === 0) { bar.classList.remove('visible'); return; }
  bar.classList.add('visible');

  const mofs = [...DB.compare].map(id => DB.all.find(m => m.id === id)).filter(Boolean);
  const chips = mofs.map(mof => {
    const mv = getMetalViz(mof.metalNode);
    return `<div class="compare-chip">
      <span style="width:5px;height:5px;border-radius:50%;background:${mv.color};flex-shrink:0;display:inline-block;"></span>
      <span>${mof.name}</span>
      <button onclick="MOFFIT.toggleCompare('${mof.id}')" aria-label="Remove ${mof.name}" class="compare-chip-x">×</button>
    </div>`;
  }).join('');

  bar.innerHTML = `
    <div class="compare-bar-inner">
      <div class="compare-bar-label">
        <span style="color:var(--cyan);font-family:var(--font-mono);font-size:10px;
                     letter-spacing:0.1em;text-transform:uppercase;">
          Comparing ${mofs.length}/3
        </span>
        <div class="compare-chips">${chips}</div>
      </div>
      <div class="compare-bar-actions">
        <button class="btn-compare-clear" onclick="MOFFIT.clearCompare()">Clear</button>
        <button class="btn-compare-open"  onclick="MOFFIT.openCompareModal()"
                ${mofs.length < 2 ? 'disabled title="Select at least 2 MOFs"' : ''}>
          ⬡ Compare ${mofs.length} MOFs
        </button>
      </div>
    </div>`;
}

function clearCompare() {
  DB.compare.clear();
  if (DB.revealed) renderCards(DB.active, document.getElementById('results-grid'));
  else updateCompareBar();
}

/* ── Modal open/close ── */
function openCompareModal() {
  const mofs = [...DB.compare].map(id => DB.all.find(m => m.id === id)).filter(Boolean);
  if (mofs.length < 2) return;

  const modal = document.getElementById('compare-modal');
  if (!modal) return;

  modal.innerHTML = buildCompareModalContent(mofs);
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';

  // Draw radar after DOM is ready
  requestAnimationFrame(() => drawRadarChart(mofs));
}

function closeCompareModal() {
  const modal = document.getElementById('compare-modal');
  if (modal) modal.classList.remove('open');
  document.body.style.overflow = '';
}

/* ── Comparison table + radar ── */
function buildCompareModalContent(mofs) {
  const COMPARE_COLORS = ['#00d4ff','#8b5cf6','#14b8a6'];

  const metricRows = [
    { label:'Surface Area (m²/g)',    key:'surfaceArea',         fmt: v => v.toLocaleString() },
    { label:'Pore Volume (cm³/g)',    key:'poreVolume',          fmt: v => v.toFixed(2) },
    { label:'Pore Size (Å)',          key:'poreSize',            fmt: v => v },
    { label:'Thermal Stability (°C)', key:'thermalStability',    fmt: v => v },
    { label:'Water Stability',        key:'waterStability',      fmt: v => v },
    { label:'Metal Node',             key:'metalNode',           fmt: v => v },
    { label:'AI Score',               key:'recommendationScore', fmt: v => v },
  ];

  const colHeaders = mofs.map((m, i) => `
    <th style="color:${COMPARE_COLORS[i]};font-family:var(--font-display);
               font-size:15px;font-weight:700;padding:10px 16px;text-align:center;
               border-bottom:2px solid ${COMPARE_COLORS[i]}40;">
      ${m.name}
      <div style="font-family:var(--font-mono);font-size:9px;color:var(--text-muted);
                  font-weight:400;margin-top:3px;">${m.formula}</div>
    </th>`).join('');

  const tableRows = metricRows.map(row => {
    const vals = mofs.map(m => m[row.key]);
    // Highlight best numeric value
    const numVals = vals.map(v => parseFloat(v));
    const best = isNaN(numVals[0]) ? -1 : Math.max(...numVals);

    const cells = mofs.map((m, i) => {
      const v    = row.fmt(m[row.key]);
      const nv   = parseFloat(m[row.key]);
      const isBest = !isNaN(nv) && nv === best && mofs.length > 1;
      return `<td style="padding:10px 16px;text-align:center;font-family:var(--font-mono);
                          font-size:13px;color:${isBest ? COMPARE_COLORS[i] : 'var(--text-secondary)'};
                          font-weight:${isBest ? '600' : '400'};border-bottom:1px solid var(--border);">
                ${v}${isBest ? ' ★' : ''}
              </td>`;
    }).join('');

    return `<tr>
      <td style="padding:10px 16px;font-family:var(--font-mono);font-size:10px;
                 color:var(--text-muted);letter-spacing:0.06em;text-transform:uppercase;
                 border-bottom:1px solid var(--border);white-space:nowrap;">
        ${row.label}
      </td>${cells}
    </tr>`;
  }).join('');

  const appRows = mofs.map((m, i) => {
    const apps = Array.isArray(m.applicationTypes) ? m.applicationTypes : [m.applicationTypes];
    return `<td style="padding:10px 16px;text-align:center;border-bottom:1px solid var(--border);">
      ${apps.map(a => `<span style="display:inline-block;margin:2px;font-family:var(--font-mono);
                               font-size:9px;padding:3px 7px;border-radius:4px;
                               background:${COMPARE_COLORS[i]}15;border:1px solid ${COMPARE_COLORS[i]}30;
                               color:${COMPARE_COLORS[i]}">${a}</span>`).join('')}
    </td>`;
  }).join('');

  const descRows = mofs.map((m, i) => `
    <td style="padding:12px 16px;font-family:var(--font-mono);font-size:11px;
               color:var(--text-secondary);line-height:1.55;vertical-align:top;
               border-bottom:1px solid var(--border);">
      ${m.description}
    </td>`).join('');

  return `
  <div class="compare-modal-backdrop" onclick="MOFFIT.closeCompareModal()"></div>
  <div class="compare-modal-box" role="dialog" aria-modal="true" aria-label="MOF Comparison">
    <div class="compare-modal-header">
      <div>
        <div style="font-family:var(--font-display);font-size:22px;font-weight:700;">MOF Comparison</div>
        <div style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);margin-top:3px;">
          ${mofs.map(m => m.name).join(' vs ')}
        </div>
      </div>
      <button class="compare-close-btn" onclick="MOFFIT.closeCompareModal()" aria-label="Close comparison">✕</button>
    </div>

    <!-- Radar chart -->
    <div class="compare-radar-wrap">
      <canvas id="radar-canvas" aria-label="Radar comparison chart"></canvas>
      <div class="compare-radar-legend">
        ${mofs.map((m,i) => `
          <div style="display:flex;align-items:center;gap:6px;font-family:var(--font-mono);font-size:11px;">
            <span style="width:10px;height:10px;border-radius:50%;background:${COMPARE_COLORS[i]};flex-shrink:0;"></span>
            <span style="color:var(--text-secondary);">${m.name}</span>
          </div>`).join('')}
      </div>
    </div>

    <!-- Data table -->
    <div style="overflow-x:auto;margin-top:8px;border-radius:10px;border:1px solid var(--border);">
      <table style="width:100%;border-collapse:collapse;min-width:460px;">
        <thead>
          <tr>
            <th style="padding:10px 16px;text-align:left;font-family:var(--font-mono);font-size:10px;
                       color:var(--text-muted);letter-spacing:0.1em;text-transform:uppercase;
                       border-bottom:1px solid var(--border);">Property</th>
            ${colHeaders}
          </tr>
        </thead>
        <tbody>
          ${tableRows}
          <tr>
            <td style="padding:10px 16px;font-family:var(--font-mono);font-size:10px;
                       color:var(--text-muted);letter-spacing:0.06em;text-transform:uppercase;
                       border-bottom:1px solid var(--border);">Applications</td>
            ${appRows}
          </tr>
          <tr>
            <td style="padding:12px 16px;font-family:var(--font-mono);font-size:10px;
                       color:var(--text-muted);letter-spacing:0.06em;text-transform:uppercase;
                       vertical-align:top;border-bottom:1px solid var(--border);">AI Insight</td>
            ${descRows}
          </tr>
        </tbody>
      </table>
    </div>
  </div>`;
}

/* ── Radar / Spider Chart ── */
function drawRadarChart(mofs) {
  const canvas = document.getElementById('radar-canvas');
  if (!canvas) return;

  const wrap = canvas.closest('.compare-radar-wrap');
  const size  = Math.min(wrap?.clientWidth ?? 320, 320);
  canvas.width  = size;
  canvas.height = size;

  const ctx  = canvas.getContext('2d');
  const cx   = size / 2, cy = size / 2;
  const R    = size * 0.38;
  const COLORS = ['#00d4ff','#8b5cf6','#14b8a6'];

  const AXES = [
    { label:'Surface',  key:'surfaceArea',         max:5900 },
    { label:'Porosity', key:'poreVolume',           max:3.86 },
    { label:'Stability',key:'thermalStability',     max:550  },
    { label:'Score',    key:'recommendationScore',  max:10   },
    { label:'WaterStab',key:'_waterStab',           max:100  },
  ];

  // Map water stability text → 0-100
  const stabMap = { Excellent:95, High:82, Good:65, Moderate:55, Low:30 };
  const axisCount = AXES.length;

  function getVal(mof, axis) {
    if (axis.key === '_waterStab') return (stabMap[mof.waterStability] ?? 50) / 100;
    return Math.min((mof[axis.key] ?? 0) / axis.max, 1);
  }

  // Background
  ctx.fillStyle = '#050b12';
  ctx.fillRect(0, 0, size, size);

  // Grid rings (5 levels)
  for (let ring = 1; ring <= 5; ring++) {
    const rr = R * ring / 5;
    ctx.beginPath();
    for (let i = 0; i < axisCount; i++) {
      const a = (i / axisCount) * Math.PI * 2 - Math.PI / 2;
      const x = cx + rr * Math.cos(a), y = cy + rr * Math.sin(a);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = 'rgba(0,212,255,0.1)';
    ctx.lineWidth   = 1;
    ctx.stroke();

    if (ring === 5) ctx.strokeStyle = 'rgba(0,212,255,0.25)';
    ctx.stroke();
  }

  // Axis spokes + labels
  AXES.forEach((axis, i) => {
    const a = (i / axisCount) * Math.PI * 2 - Math.PI / 2;
    const lx = cx + (R + 18) * Math.cos(a);
    const ly = cy + (R + 18) * Math.sin(a);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + R * Math.cos(a), cy + R * Math.sin(a));
    ctx.strokeStyle = 'rgba(0,212,255,0.15)';
    ctx.lineWidth   = 1;
    ctx.stroke();

    ctx.font         = `10px monospace`;
    ctx.fillStyle    = 'rgba(125,160,184,0.85)';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(axis.label, lx, ly);
  });

  // MOF polygons
  mofs.forEach((mof, mi) => {
    const col = COLORS[mi];
    ctx.beginPath();
    AXES.forEach((axis, i) => {
      const a = (i / axisCount) * Math.PI * 2 - Math.PI / 2;
      const v = getVal(mof, axis);
      const x = cx + R * v * Math.cos(a);
      const y = cy + R * v * Math.sin(a);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.closePath();

    // Fill
    ctx.fillStyle = col.replace('#','rgba(').replace(/(..)(..)(..)/, (_, r, g, b) =>
      `${parseInt(r,16)},${parseInt(g,16)},${parseInt(b,16)},0.12)`);
    ctx.fill();

    // Stroke
    ctx.strokeStyle = col;
    ctx.lineWidth   = 2;
    ctx.stroke();

    // Dots
    AXES.forEach((axis, i) => {
      const a = (i / axisCount) * Math.PI * 2 - Math.PI / 2;
      const v = getVal(mof, axis);
      const x = cx + R * v * Math.cos(a);
      const y = cy + R * v * Math.sin(a);
      ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = col; ctx.fill();
    });
  });
}

/* ════════════════════════════════════════════
   FILTER / SEARCH / SORT
════════════════════════════════════════════ */
function filterMOFs(mofs, appType, metalNode) {
  return mofs.filter(mof => {
    const matchesApp = (!appType||appType==='all') ? true
      : (Array.isArray(mof.applicationTypes)
          ? mof.applicationTypes.some(a=>a.toLowerCase().includes(appType.toLowerCase()))
          : mof.applicationTypes.toLowerCase().includes(appType.toLowerCase()));
    const matchesMetal = (!metalNode||metalNode==='Any') ? true
      : mof.metalNode.toLowerCase().includes(metalNode.toLowerCase());
    return matchesApp && matchesMetal;
  });
}

function searchMOFs(mofs, query) {
  if (!query||!query.trim()) return mofs;
  const q=query.trim().toLowerCase();
  return mofs.filter(mof =>
    mof.name.toLowerCase().includes(q)||mof.formula.toLowerCase().includes(q)||
    mof.metalNode.toLowerCase().includes(q)||mof.description.toLowerCase().includes(q)||
    (Array.isArray(mof.applicationTypes)?mof.applicationTypes.some(a=>a.toLowerCase().includes(q)):mof.applicationTypes.toLowerCase().includes(q))
  );
}

function sortMOFs(mofs) { return [...mofs].sort((a,b)=>b.recommendationScore-a.recommendationScore); }

/* ════════════════════════════════════════════
   PIPELINE — filter → range → search → sort
════════════════════════════════════════════ */
function applyPipeline(reveal = false) {
  const grid      = document.getElementById('results-grid');
  const appType   = document.getElementById('app-type')?.value   ?? '';
  const metalNode = document.getElementById('metal-node')?.value ?? 'Any';
  const query     = document.getElementById('mof-search')?.value ?? '';

  let results = filterMOFs(DB.all, appType, metalNode);
  results     = filterByRanges(results);          // ← NEW: range filter
  results     = searchMOFs(results, query);
  results     = sortMOFs(results);
  DB.active   = results;

  if (reveal) DB.revealed = true;
  if (!DB.revealed) { showPromptState(grid); return; }

  renderCards(results, grid);
  setTimeout(() => grid.scrollIntoView({ behavior:'smooth', block:'start' }), 600);
}

/* ════════════════════════════════════════════
   LOAD MOFs + calibrate range bounds
════════════════════════════════════════════ */
async function loadMOFs() {
  const grid = document.getElementById('results-grid');
  if (!grid) return;
  showLoadingState(grid);
  try {
    const res  = await fetch(CONFIG.dataUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data)||!data.length) throw new Error('Empty dataset');
    DB.all = data;

    // Calibrate RANGES from real data
    RANGE_DEFS.forEach(def => {
      const vals = data.map(m => m[def.key]).filter(v => typeof v === 'number');
      if (!vals.length) return;
      RANGES[def.key].min = Math.floor(Math.min(...vals) / def.step) * def.step;
      RANGES[def.key].max = Math.ceil( Math.max(...vals) / def.step) * def.step;
      RANGES[def.key].lo  = RANGES[def.key].min;
      RANGES[def.key].hi  = RANGES[def.key].max;
    });

    buildRangePanel();   // render sliders with real bounds
    showPromptState(grid);
    const panel = document.getElementById('mof-selector-panel');
    if (panel) panel.style.display = 'none';
  } catch (err) { showErrorState(grid, err.message); }
}

/* ════════════════════════════════════════════
   RESET ALL
════════════════════════════════════════════ */
function resetFilters() {
  ['app-type','metal-node'].forEach(id=>{ const el=document.getElementById(id); if(el)el.selectedIndex=0; });
  const s=document.getElementById('mof-search'); if(s)s.value='';
  resetRanges();
}

/* ════════════════════════════════════════════
   GENERATE
════════════════════════════════════════════ */
function generateRec() { applyPipeline(true); }

/* ════════════════════════════════════════════
   DEBOUNCE
════════════════════════════════════════════ */
function debounce(fn, ms) { let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms); }; }

/* ════════════════════════════════════════════
   WIRE CONTROLS
════════════════════════════════════════════ */
function wireControls() {
  const si = document.getElementById('mof-search');
  if (si) si.addEventListener('input', debounce(()=>{ if(DB.revealed)applyPipeline(true); }, CONFIG.searchDebounceMs));
  ['app-type','metal-node'].forEach(id=>{
    const el=document.getElementById(id);
    if(el)el.addEventListener('change',()=>{ if(DB.revealed)applyPipeline(true); });
  });
  // Close modal on Escape
  document.addEventListener('keydown', e => { if(e.key==='Escape') closeCompareModal(); });
}

/* ════════════════════════════════════════════
   PUBLIC API
════════════════════════════════════════════ */
window.MOFFIT = {
  loadMOFs, generateRec, resetFilters, selectMOF,
  applyPipeline, filterMOFs, searchMOFs, sortMOFs,
  // Range filter
  onRangeInput, resetRanges,
  // Comparison
  toggleCompare, clearCompare, openCompareModal, closeCompareModal,
  getAll:      ()=>[...DB.all],
  getActive:   ()=>[...DB.active],
  getSelected: ()=>DB.selected,
  config: CONFIG,
};

/* ════════════════════════════════════════════
   BOOT
════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => { wireControls(); loadMOFs(); });
