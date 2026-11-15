// Guided live-demo script (DemoGuide.jsx). Each step only navigates to a real screen and/or
// sets real app state (target, objective, weights, shortlist) through AppState — the same
// actions a user's clicks perform. Nothing here simulates processing or produces numbers;
// every score on screen comes from scoring.js. Narration text is for the presenter.
import { PRESETS } from './presets.js'
import { rankWith } from './rankShift.js'

/** First Mars target in the bundle, preferring Jezero (the documented scenario). */
export function demoTarget(targets) {
  return targets.find((t) => t.id === 'mars-jezero') || targets.find((t) => t.body === 'mars') || targets[0] || null
}

/** Top `n` scored places in the current ranking. */
export const topSites = (ranking, n) => ranking.filter((r) => r.score !== null).slice(0, n).map((r) => r.site)

/** Top `n` places for the current target under the objective's own weights (same engine as the results). */
function objectiveTop({ app, data, target }, n) {
  const weights = PRESETS[app.basePresetId]?.weights
  if (!target || !weights) return []
  return topSites(rankWith(target, data.sites, weights, data.features, data.minCriteria, app.rankBy, data.siteById), n)
}

// go(ctx) performs the step: ctx = { app, data, target } → returns the location to open
// ({ pathname, search? }) or null to stay. `spot` = CSS selector to bring into view.
export const DEMO_STEPS = [
  {
    id: 'overview',
    title: 'Mission overview',
    secs: 15,
    say: 'Mission teams rehearse on Earth before they fly. No place on Earth is a copy of Mars — the right analog depends on what you want to test.',
    go: () => ({ pathname: '/' }),
    spot: '.home2__console',
  },
  {
    id: 'target',
    title: 'Select Mars as the target',
    secs: 10,
    say: 'Choose Mars, then Jezero Crater. The globe turns to the cited landing-site coordinates.',
    go: ({ app, target }) => {
      if (target) app.setTarget(target.id)
      return { pathname: '/' }
    },
    spot: '.home2__visual',
  },
  {
    id: 'objective',
    title: 'Select a research objective',
    secs: 10,
    say: 'Objective: Rover testing. An objective is only a set of criterion weights — it weighs terrain relief and bare ground most.',
    go: ({ app }) => {
      app.setPreset('rover')
      // the app's documented Jezero + Rover scenario ranks by the conservative lower bound
      app.setRankBy('min')
      return { pathname: '/' }
    },
    spot: '.home2__console',
  },
  {
    id: 'priorities',
    title: 'Configure research priorities',
    secs: 15,
    say: 'Every criterion is weighted 0–5 (0 = ignored). These are our screening priorities, not validated mission requirements.',
    go: () => ({ pathname: '/', search: '?crit=1' }),
    spot: '#home-criteria',
  },
  {
    id: 'run',
    title: 'Run the discovery',
    secs: 10,
    say: 'Find places on Earth. Scoring runs in the browser on a static bundle of NASA-derived data prepared offline — so the ranking is instant; there is no server call.',
    go: ({ app }) => {
      app.setRankBy('min')
      return { pathname: '/explore' }
    },
    spot: '.explore__head',
  },
  {
    id: 'results',
    title: 'Ranked Earth analog candidates',
    secs: 15,
    say: 'Ordered by the conservative lower bound: the score a place keeps even if every missing measurement were a total mismatch, so evidence-backed places come first. Each card shows one evidence-backed reason and a missing-data chip — missing data is never counted as zero.',
    go: () => ({ pathname: '/explore' }),
    spot: '.explore__results',
  },
  {
    id: 'map',
    title: 'Explore the candidates on the map',
    secs: 15,
    say: 'Click a card: its marker highlights and the map flies to it. Ring colour is the score; a ring marker is an uncatalogued candidate — a lead, not a confirmed analog.',
    go: () => ({ pathname: '/explore' }),
    spot: '.leaflet-container',
  },
  {
    id: 'reweight',
    title: 'Change priorities — watch the ranking move',
    secs: 25,
    say: 'Turn terrain relief off: places move, the live ranking shows previous → current rank and which weight change caused each move — and places without enough data drop out instead of scoring zero. Below the map, the same target under four objectives: Rover testing puts Holuhraun first, Ice exploration puts Atacama first.',
    action: {
      label: 'Set terrain relief to 0',
      run: ({ app, data }) => {
        if (data.features.some((f) => f.id === 'terrain')) app.setWeight('terrain', 0)
      },
    },
    go: () => ({ pathname: '/explore', search: '?adv=1' }),
    spot: '.lrank',
  },
  {
    id: 'candidate',
    title: 'Inspect a candidate',
    secs: 20,
    say: 'Why this match: the strongest match with both values and their sources, the most important difference, and what still needs measuring.',
    go: (ctx) => {
      ctx.app.resetWeights()
      const top = objectiveTop(ctx, 1)[0]
      return top ? { pathname: `/site/${encodeURIComponent(top)}` } : { pathname: '/explore' }
    },
    spot: '.page',
  },
  {
    id: 'compare',
    title: 'Compare the best candidates',
    secs: 20,
    say: 'Shortlist the top three and compare: one-sentence verdict, aligned metrics, radar and a criterion table. A high score on partial data is called out.',
    go: (ctx) => {
      ctx.app.resetWeights()
      ctx.app.setShortlist(objectiveTop(ctx, 3))
      return { pathname: '/compare' }
    },
    spot: '#cmp-plain-title',
  },
  {
    id: 'evidence',
    title: 'Matches, mismatches and evidence',
    secs: 20,
    say: 'Planetary Mirror: the Mars site and the Earth place side by side at one ground scale. Choose a criterion to see both real values and their sources; the 3D view is built from the actual elevation grids, exaggeration stated.',
    go: (ctx) => {
      const top = objectiveTop(ctx, 1)[0]
      return { pathname: '/mirror', search: top ? `?site=${encodeURIComponent(top)}` : '' }
    },
    spot: '.page',
  },
  {
    id: 'report',
    title: 'Generate the scientific report',
    secs: 15,
    say: 'One click: mission configuration, priorities, ranking, parameter comparison, method, sources and limitations — print to PDF, or export CSV and JSON.',
    go: () => ({ pathname: '/report' }),
    spot: '.page',
  },
]

export const DEMO_TOTAL_SECS = DEMO_STEPS.reduce((n, s) => n + s.secs, 0)

// ---- guide state (sessionStorage; survives a reload during the demo) ----
const KEY = 'eaf-demo-step'

export function readStep() {
  try {
    const v = sessionStorage.getItem(KEY)
    return v === null ? null : Math.min(Math.max(Number(v) || 0, 0), DEMO_STEPS.length - 1)
  } catch {
    return null
  }
}

export function writeStep(v) {
  try {
    if (v === null) sessionStorage.removeItem(KEY)
    else sessionStorage.setItem(KEY, String(v))
  } catch {
    /* storage unavailable: the guide still works for this page view */
  }
}

/** Start the guided demo from anywhere (Home button, ?demo=1). */
export function startDemo() {
  writeStep(0)
  window.dispatchEvent(new Event('eaf-demo'))
}
