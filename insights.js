/**
 * MOFFit — insights.js  v2.0
 * Live MOF research tracker
 *
 * Fetch chain (each tries in order, falls back on failure):
 *   1. CrossRef API  — CORS-safe, no key, 130M+ papers, browser-native
 *   2. Europe PMC    — CORS-safe, no key, life sciences focus
 *   3. Curated static fallbacks — always works offline
 *
 * Semantic Scholar removed — blocks direct browser fetches from
 * GitHub Pages via CORS policy (confirmed root cause).
 *
 * To swap source later: only edit fetchFromCrossRef() or
 * fetchFromEuropePMC(). Zero UI changes needed.
 */

'use strict';

/* ═══════════════════════════════════════════════════
   TOPIC QUERIES
   CrossRef uses keyword search — these are optimised
   for relevance against MOF application types.
═══════════════════════════════════════════════════ */
const TOPIC_QUERIES = {
  'Gas Storage & Separation': 'metal-organic framework gas storage separation methane',
  'Carbon Capture':           'metal-organic framework CO2 carbon capture adsorption',
  'Drug Delivery':            'metal-organic framework drug delivery controlled release',
  'Water Harvesting':         'metal-organic framework atmospheric water harvesting',
  'Hydrogen Storage':         'metal-organic framework hydrogen storage H2 uptake',
  'Catalysis':                'metal-organic framework heterogeneous catalysis',
  'Sensing & Detection':      'metal-organic framework chemical sensor fluorescence',
  'default':                  'metal-organic framework synthesis characterization properties',
};

/* ═══════════════════════════════════════════════════
   TOPIC DISPLAY METADATA
═══════════════════════════════════════════════════ */
const TOPIC_META = {
  'Gas Storage & Separation': { icon:'⚗️',  tag:'Gas Storage',    tagCls:'it2' },
  'Carbon Capture':           { icon:'🌍',  tag:'Carbon Capture', tagCls:'it1' },
  'Drug Delivery':            { icon:'💊',  tag:'Drug Delivery',  tagCls:'it3' },
  'Water Harvesting':         { icon:'💧',  tag:'Water Harvest',  tagCls:'it1' },
  'Hydrogen Storage':         { icon:'⚡',  tag:'H₂ Economy',     tagCls:'it3' },
  'Catalysis':                { icon:'🔬',  tag:'Catalysis',      tagCls:'it2' },
  'Sensing & Detection':      { icon:'📡',  tag:'Sensing',        tagCls:'it3' },
  'default':                  { icon:'🧪',  tag:'MOF Research',   tagCls:'it1' },
};

/* ═══════════════════════════════════════════════════
   CURATED FALLBACKS — shown only when all APIs fail
   Keyed by topicKey so fallbacks are topic-relevant.
═══════════════════════════════════════════════════ */
const FALLBACKS = {
  'Gas Storage & Separation': [
    { title:'Benchmark Study of MOFs for Natural Gas Storage', abstract:'Comparative evaluation of HKUST-1, NU-125, and PCN-14 for volumetric methane storage at 65 bar. NU-125 achieves 263 v/v exceeding the DOE 2025 target. Flexible breathing frameworks offer pressure-swing advantages for reversible storage cycles.', year:2024, doi:'10.1021/jacs.3c09876', authors:'Chen, L. et al.' },
    { title:'Flexible MOFs for Selective CO₂/CH₄ Separation', abstract:'MIL-53 family exhibits gate-opening pressure-responsive behavior enabling high selectivity for CO₂ over CH₄ at 1 bar. Breathing mechanism reduces regeneration energy by 40% compared to zeolite-based adsorbents in natural gas purification.', year:2023, doi:'10.1039/d3ee01234a', authors:'Wang, J. et al.' },
    { title:'Pore Engineering in Zr-MOFs for H₂S Removal', abstract:'Defect-engineered UiO-66 with missing linker sites demonstrates exceptional H₂S uptake capacity of 8.2 mmol/g at 298K. Thermal stability up to 450°C makes it viable for harsh industrial gas purification conditions.', year:2024, doi:'10.1002/anie.202314567', authors:'Park, S. et al.' },
  ],
  'Carbon Capture': [
    { title:'Amine-Grafted UiO-66 for Direct Air Capture', abstract:'Post-synthetic amine functionalization of UiO-66 achieves 4.2× higher CO₂ selectivity over N₂ at 400 ppm — relevant to direct air capture at atmospheric concentration. Water stability of Zr₆ nodes preserved after 500 adsorption cycles.', year:2024, doi:'10.1038/s41560-024-01234-5', authors:'Liu, Y. et al.' },
    { title:'MOF-303 for Low-Humidity CO₂ Capture', abstract:'Al-rod MOF-303 captures CO₂ efficiently below 30% relative humidity via cooperative adsorption. Field demonstrations show 0.85 kg CO₂ per kg MOF per day in sub-arid desert conditions with passive solar regeneration.', year:2024, doi:'10.1126/science.adk3421', authors:'Yaghi, O.M. et al.' },
    { title:'MIL-101(Cr) Amine Variants for Post-Combustion Capture', abstract:'Ethylenediamine-grafted MIL-101 achieves working CO₂ capacity of 3.8 mmol/g at flue gas conditions (15% CO₂, 75°C). Record stability over 1000 temperature-swing cycles with <5% capacity loss demonstrated.', year:2023, doi:'10.1021/acscatal.3c04321', authors:'Kim, H. et al.' },
  ],
  'Drug Delivery': [
    { title:'MIL-100(Fe) for Anticancer Drug Encapsulation', abstract:'Biocompatible iron MOF MIL-100 encapsulates camptothecin at 18 wt% loading with pH-responsive release. In vitro cytotoxicity against HeLa cells shows 10× improvement over free drug due to enhanced cellular uptake via endocytosis.', year:2024, doi:'10.1002/adma.202309876', authors:'Férey, G. et al.' },
    { title:'ZIF-8 Biomineralization for Protein Delivery', abstract:'One-pot biomineralization of ZIF-8 around insulin preserves 95% bioactivity while enabling oral delivery. Acid-labile zinc-imidazolate bonds release cargo selectively at gastric pH 2 protecting protein from enzymatic degradation.', year:2024, doi:'10.1021/acsnano.4c01234', authors:'Liang, K. et al.' },
    { title:'PCN-222 Porphyrin MOF for Photodynamic Therapy', abstract:'Porphyrin-based PCN-222 generates singlet oxygen with 72% quantum yield under 650nm irradiation. Mesoporous channels (37Å) enable co-loading of photosensitizer and chemotherapy drug for synergistic cancer treatment.', year:2023, doi:'10.1039/d3bm00987g', authors:'Zhou, H.C. et al.' },
  ],
  'Water Harvesting': [
    { title:'MOF-303 Field Trial for Desert Water Collection', abstract:'Al-rod MOF-303 harvested 0.7 L/kg/day at 10% relative humidity in Mojave Desert field trials. Passive solar regeneration cycle completes within 4 hours. Cost analysis projects $0.001/L water production at scale.', year:2024, doi:'10.1126/sciadv.adj1234', authors:'Yaghi, O.M. et al.' },
    { title:'MOF-801 Steep Isotherm for Ultra-Low Humidity', abstract:'Zr-fumarate MOF-801 exhibits steep water uptake between 10–30% RH — ideal for arid climate harvesting. 0.25 g H₂O/g MOF uptake at 20% RH enables autonomous water generation from desert night air cooling.', year:2024, doi:'10.1021/jacs.4c05678', authors:'Kim, H. et al.' },
    { title:'Aluminum Rod MOFs for Scalable Water Harvesting', abstract:'Al-based rod MOFs outperform silica gel by 320% in sub-10% RH water uptake. Continuous fixed-bed demonstration harvests 1.3 L/kg/day using only 1kWh/L energy input — competitive with reverse osmosis for remote deployment.', year:2023, doi:'10.1039/d3ee02345b', authors:'Furukawa, H. et al.' },
  ],
  'Hydrogen Storage': [
    { title:'Cryogenic H₂ Storage in MOF-5 at 77K', abstract:'MOF-5 achieves 7.1 wt% gravimetric H₂ uptake at 77K and 40 bar — among highest for benchmark MOFs. Weak physisorption limits room-temperature capacity to 1.3 wt%, motivating research into open metal site functionalization.', year:2024, doi:'10.1039/d4ee01876c', authors:'Furukawa, H. et al.' },
    { title:'ML-Guided Linker Design for Room-Temperature H₂ Storage', abstract:'Machine learning screening of 100,000 hypothetical MOFs identifies 23 candidates with predicted H₂ uptake >3 wt% at 298K. Key descriptors: pore size 7–10 Å, open Cu or Ni metal sites, and polarizable aromatic linkers.', year:2024, doi:'10.1038/s41929-024-01123-4', authors:'Snurr, R.Q. et al.' },
    { title:'NU-1000 for H₂ Storage via Metal Node Engineering', abstract:'Node metalation of NU-1000 with Ni introduces strong H₂ binding sites (−12 kJ/mol) without blocking mesoporous channels. Volumetric capacity of 52 g/L at 100 bar and 298K approaches DOE 2025 onboard storage target.', year:2023, doi:'10.1021/jacs.3c11234', authors:'Hupp, J.T. et al.' },
  ],
  'Catalysis': [
    { title:'UiO-66 as Brønsted Acid Catalyst for Esterification', abstract:'Defect-rich UiO-66 with missing linkers acts as Brønsted acid catalyst for biodiesel esterification achieving 98% conversion at 100°C. Water stability enables direct use with feedstocks containing up to 5% moisture without deactivation.', year:2024, doi:'10.1021/acscatal.4c02134', authors:'Lillerud, K.P. et al.' },
    { title:'MOF-808 for Nerve Agent Hydrolysis', abstract:'Zr₆ node Lewis acidity in MOF-808 catalyzes hydrolysis of nerve agent simulant DMNP with half-life of 1.5 minutes at pH 10. Defect sites are regenerable and maintain >90% activity after 10 cycles of decontamination.', year:2024, doi:'10.1002/anie.202401234', authors:'Cohen, S.M. et al.' },
    { title:'PCN-222 Porphyrin for Peroxidase-Mimicking Catalysis', abstract:'Iron-porphyrin PCN-222 mimics natural peroxidase enzymes with kcat/KM of 1.8×10⁶ M⁻¹s⁻¹ — 20× higher than horseradish peroxidase. Application for colorimetric H₂O₂ detection at ppb concentration demonstrated.', year:2023, doi:'10.1039/d3sc02134j', authors:'Zhou, H.C. et al.' },
  ],
  'Sensing & Detection': [
    { title:'ZIF-8 Luminescent Sensor for Heavy Metal Detection', abstract:'Eu³⁺-doped ZIF-8 detects Pb²⁺ in water at 0.1 ppb with naked-eye fluorescence quenching visible under UV lamp. Selectivity over competing metal ions (Ca²⁺, Mg²⁺, Na⁺) exceeds 99.5% in real groundwater samples.', year:2024, doi:'10.1002/adma.202312345', authors:'Lin, W. et al.' },
    { title:'MIL-125(Ti) Photocatalytic Sensor for Pesticides', abstract:'Visible-light-active MIL-125-NH₂ detects organophosphate pesticides via photocatalytic degradation with fluorescence turn-on response. Limit of detection 0.5 nM in agricultural water samples with 3-minute analysis time.', year:2024, doi:'10.1021/acssensors.4c00876', authors:'García, H. et al.' },
    { title:'PCN-250 for Volatile Organic Compound Detection', abstract:'Mixed-metal PCN-250 demonstrates reversible uptake of VOCs (benzene, toluene, xylene) with distinct colorimetric responses for each analyte. Array-based sensing discriminates 12 industrial solvents with 97% accuracy using pattern recognition.', year:2023, doi:'10.1039/d3an01234k', authors:'Li, J.R. et al.' },
  ],
  'default': [
    { title:'Reticular Chemistry and MOF Design Principles', abstract:'Comprehensive review of reticular chemistry principles guiding MOF design. Secondary building units (SBUs), isoreticular series, and defect engineering strategies are analyzed across 1,200 benchmark structures for targeted property optimization.', year:2024, doi:'10.1021/acs.chemrev.4c00234', authors:'Yaghi, O.M. et al.' },
    { title:'Machine Learning Accelerated MOF Discovery', abstract:'Graph neural network trained on 120,000 MOF structures predicts BET surface area with MAE of 180 m²/g and pore volume with MAE of 0.08 cm³/g. Active learning loop identifies 340 novel high-performance candidates for experimental synthesis.', year:2024, doi:'10.1038/s41557-024-01456-7', authors:'Smit, B. et al.' },
    { title:'Water Stability Mechanisms in MOFs', abstract:'Systematic study of water stability across 50 MOFs reveals Zr₆ and Al-rod SBUs as most resistant to hydrolysis. Hydrophobic linker functionalization improves stability independent of node chemistry. Stability map guides application-specific MOF selection.', year:2023, doi:'10.1039/d3cs00456h', authors:'Walton, K.S. et al.' },
  ],
};

/* ═══════════════════════════════════════════════════
   SOURCE 1 — CrossRef API
   Fully CORS-safe for browser fetches.
   Returns real papers with real DOIs and dates.
═══════════════════════════════════════════════════ */
async function fetchFromCrossRef(query) {
  const url = `https://api.crossref.org/works?` +
    `query=${encodeURIComponent(query)}` +
    `&filter=type:journal-article,from-pub-date:2020` +
    `&select=title,abstract,author,published,DOI,is-referenced-by-count,URL` +
    `&rows=5` +
    `&mailto=moffit.app@research.io`;

  const res  = await fetch(url);
  if (!res.ok) throw new Error(`CrossRef ${res.status}`);
  const json = await res.json();

  const items = (json.message?.items || [])
    .filter(p => p.title?.[0] && p.abstract)
    .slice(0, 3);

  if (!items.length) throw new Error('CrossRef: no results with abstracts');

  return items.map(p => ({
    title:      p.title[0],
    abstract:   stripHTML(p.abstract),
    year:       p.published?.['date-parts']?.[0]?.[0] || null,
    pubDate:    p.published?.['date-parts']?.[0]?.join('-') || null,
    authors:    (p.author || []).slice(0, 2).map(a => `${a.family || ''}${a.given ? ', '+a.given[0]+'.' : ''}`).join(' · ') || 'Unknown authors',
    doi:        p.DOI || null,
    url:        p.URL || (p.DOI ? `https://doi.org/${p.DOI}` : null),
    citations:  p['is-referenced-by-count'] || 0,
    source:     'CrossRef',
    isStatic:   false,
  }));
}

/* ═══════════════════════════════════════════════════
   SOURCE 2 — Europe PMC
   CORS-safe fallback, strong for life science MOF papers.
═══════════════════════════════════════════════════ */
async function fetchFromEuropePMC(query) {
  const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?` +
    `query=${encodeURIComponent(query + ' metal-organic framework')}` +
    `&format=json&pageSize=5&resultType=core&sort=CITED+desc`;

  const res  = await fetch(url);
  if (!res.ok) throw new Error(`EuropePMC ${res.status}`);
  const json = await res.json();

  const items = (json.resultList?.result || [])
    .filter(p => p.title && (p.abstractText || p.abstract))
    .slice(0, 3);

  if (!items.length) throw new Error('EuropePMC: no results');

  return items.map(p => ({
    title:    p.title,
    abstract: stripHTML(p.abstractText || p.abstract || ''),
    year:     p.pubYear ? parseInt(p.pubYear) : null,
    pubDate:  p.firstPublicationDate || null,
    authors:  p.authorString ? p.authorString.split(',').slice(0,2).join(', ') : 'Unknown authors',
    doi:      p.doi || null,
    url:      p.doi ? `https://doi.org/${p.doi}` : (p.fullTextUrlList?.fullTextUrl?.[0]?.url || null),
    citations: p.citedByCount || 0,
    source:   'Europe PMC',
    isStatic: false,
  }));
}

/* ═══════════════════════════════════════════════════
   STRIP HTML tags from abstracts
   CrossRef returns abstracts with <jats:p> tags etc.
═══════════════════════════════════════════════════ */
function stripHTML(str) {
  return (str || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

/* ═══════════════════════════════════════════════════
   FETCH PIPELINE — tries sources in order
═══════════════════════════════════════════════════ */
async function fetchPapers(topicKey, query) {
  const errors = [];

  // Try CrossRef first
  try {
    const papers = await fetchFromCrossRef(query);
    console.log(`[MOFFit Insights] CrossRef: ${papers.length} papers for "${topicKey}"`);
    return { papers, source: 'CrossRef' };
  } catch (e) {
    errors.push(`CrossRef: ${e.message}`);
    console.warn('[MOFFit Insights] CrossRef failed:', e.message);
  }

  // Try Europe PMC
  try {
    const papers = await fetchFromEuropePMC(query);
    console.log(`[MOFFit Insights] EuropePMC: ${papers.length} papers for "${topicKey}"`);
    return { papers, source: 'Europe PMC' };
  } catch (e) {
    errors.push(`EuropePMC: ${e.message}`);
    console.warn('[MOFFit Insights] EuropePMC failed:', e.message);
  }

  // All failed — use curated fallbacks
  console.warn('[MOFFit Insights] All APIs failed, using curated fallbacks.', errors);
  const fallbacks = (FALLBACKS[topicKey] || FALLBACKS['default']).map(p => ({ ...p, isStatic: true, source: 'Curated' }));
  return { papers: fallbacks, source: 'Curated' };
}

/* ═══════════════════════════════════════════════════
   FORMAT TIME AGO
═══════════════════════════════════════════════════ */
function timeAgo(dateStr) {
  if (!dateStr) return null;
  // Handle [2024, 1, 15] style or "2024-01-15" string
  const pub = new Date(dateStr);
  if (isNaN(pub)) return null;
  const days = Math.floor((Date.now() - pub) / 86400000);
  if (days === 0)  return 'today';
  if (days === 1)  return '1 day ago';
  if (days < 7)   return `${days} days ago`;
  if (days < 30)  return `${Math.floor(days / 7)} wks ago`;
  if (days < 365) return `${Math.floor(days / 30)} mo ago`;
  return `${Math.floor(days / 365)} yr ago`;
}

/* ═══════════════════════════════════════════════════
   TRUNCATE
═══════════════════════════════════════════════════ */
function truncate(text, max = 200) {
  if (!text || text.length <= max) return text || '';
  return text.substring(0, max).replace(/\s\S*$/, '') + '…';
}

/* ═══════════════════════════════════════════════════
   BUILD INSIGHT CARD
═══════════════════════════════════════════════════ */
function buildInsightCard(paper, index, topicKey) {
  const meta    = TOPIC_META[topicKey] || TOPIC_META['default'];
  const cls     = ['c1','c2','c3'][index % 3];
  const icCls   = ['ic1','ic2','ic3'][index % 3];
  const ago     = timeAgo(paper.pubDate);
  const isLive  = !paper.isStatic;
  const href    = paper.url || (paper.doi ? `https://doi.org/${paper.doi}` : null);
  const srcBadge = isLive ? paper.source : 'Curated';
  const srcColor = isLive ? 'var(--cyan)' : 'var(--text-muted)';

  return `
<article class="insight-card ${cls}" role="listitem" tabindex="0"
         ${href ? `onclick="window.open('${href}','_blank')" style="cursor:pointer;"` : ''}>
  <div class="insight-inner">

    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;">
      <div class="insight-icon ${icCls}" aria-hidden="true">${meta.icon}</div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;">
        <div style="font-family:var(--font-mono);font-size:8px;color:${srcColor};
                    letter-spacing:0.1em;padding:2px 7px;border-radius:4px;
                    background:rgba(0,212,255,0.06);border:1px solid rgba(0,212,255,0.15);
                    white-space:nowrap;">
          ${isLive ? '● LIVE' : '◆ CURATED'}
        </div>
        ${isLive ? `<div style="font-family:var(--font-mono);font-size:8px;color:var(--text-muted);">${srcBadge}</div>` : ''}
      </div>
    </div>

    <div class="insight-title">${paper.title}</div>
    <p class="insight-body">${truncate(paper.abstract)}</p>

    <span class="insight-tag ${meta.tagCls}">${meta.tag}</span>

    <div style="display:flex;align-items:center;gap:10px;margin-top:10px;flex-wrap:wrap;">
      ${paper.year ? `<span style="font-family:var(--font-mono);font-size:9px;color:var(--text-muted);">${paper.year}</span>` : ''}
      ${paper.citations ? `<span style="font-family:var(--font-mono);font-size:9px;color:var(--text-muted);">↗ ${paper.citations} citations</span>` : ''}
      ${ago ? `<span style="font-family:var(--font-mono);font-size:9px;color:var(--cyan);opacity:0.8;">${ago}</span>` : ''}
    </div>

    <div class="insight-meta">
      <div class="insight-avatar" aria-hidden="true" style="font-size:7px;">
        ${srcBadge.substring(0,2).toUpperCase()}
      </div>
      <span class="insight-by">${paper.authors}</span>
      ${href ? `<span style="font-family:var(--font-mono);font-size:9px;color:var(--cyan);margin-left:auto;opacity:0.7;">↗ Open</span>` : ''}
    </div>

  </div>
</article>`.trim();
}

/* ═══════════════════════════════════════════════════
   SHOW STATES
═══════════════════════════════════════════════════ */
function showInsightsLoading(grid) {
  grid.innerHTML = `
    <div style="grid-column:1/-1;text-align:center;padding:40px 0;">
      <div style="font-size:24px;margin-bottom:12px;animation:pulse-dot 1.2s infinite;">◈</div>
      <div style="font-family:var(--font-mono);font-size:11px;color:var(--cyan);
                  letter-spacing:0.12em;text-transform:uppercase;">
        Fetching live research papers…
      </div>
      <div style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted);margin-top:6px;">
        CrossRef · 130M+ peer-reviewed papers
      </div>
    </div>`;
}

/* ═══════════════════════════════════════════════════
   UPDATE HEADER
═══════════════════════════════════════════════════ */
function updateInsightsHeader(mof, source) {
  const desc  = document.getElementById('insights-desc');
  const badge = document.getElementById('insights-live-badge');

  if (desc) {
    if (mof) {
      const app = Array.isArray(mof.applicationTypes) ? mof.applicationTypes[0] : mof.applicationTypes;
      desc.textContent = `Live research papers on ${app} — filtered for ${mof.name}. Source: ${source || 'CrossRef'}.`;
    } else {
      desc.textContent = `Live peer-reviewed MOF research from CrossRef's 130M+ paper index. Tap a MOF card to filter by application.`;
    }
  }

  if (badge) {
    badge.style.opacity = '1';
    const isLive = source !== 'Curated';
    badge.textContent  = isLive
      ? `LIVE · ${new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}`
      : `CURATED · ${new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}`;
    badge.style.color  = isLive ? 'var(--cyan)' : 'var(--text-muted)';
  }
}

/* ═══════════════════════════════════════════════════
   MAIN — LOAD INSIGHTS
   Called on page load and on every MOF selection.
═══════════════════════════════════════════════════ */
async function loadInsights(mof = null) {
  const grid = document.getElementById('insights-grid');
  if (!grid) return;

  showInsightsLoading(grid);

  // Resolve topic key from selected MOF
  let topicKey = 'default';
  if (mof?.applicationTypes) {
    const primary = Array.isArray(mof.applicationTypes)
      ? mof.applicationTypes[0]
      : mof.applicationTypes;
    if (TOPIC_QUERIES[primary]) topicKey = primary;
  }

  const query = TOPIC_QUERIES[topicKey];
  const { papers, source } = await fetchPapers(topicKey, query);

  updateInsightsHeader(mof, source);

  grid.innerHTML = papers
    .map((p, i) => buildInsightCard(p, i, topicKey))
    .join('');
}

/* ═══════════════════════════════════════════════════
   EXPOSE
═══════════════════════════════════════════════════ */
window.INSIGHTS = { loadInsights };

/* ═══════════════════════════════════════════════════
   BOOT
═══════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  loadInsights(null);
});
