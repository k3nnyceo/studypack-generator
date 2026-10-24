// StudyPack's plans, and how a study pack's cost is counted against them.
//
// Usage works like Claude's own app: each pack uses part of an allowance in
// proportion to what it really cost (Claude's token bill, converted to naira),
// so a long lecture uses more than a short one. Two allowances apply at once:
//   - a 3-hour window, which refills at fixed times (00:00, 03:00, … UTC), so
//     one sitting can't use up the month, and
//   - a monthly allowance, which is what keeps a plan's cost below its price.
// Separately, each plan can add a number of ready-made packs a day from the
// shared Pack library (server/shared.js), which cost nothing to open, and
// import a number of YouTube lectures (server/youtube.js) per 3-hour window
// and per month (Free) or paid period.
// Every number can be changed with an environment variable (see .env.example).

export const WINDOW_MS = 3 * 60 * 60 * 1000
// A paid plan lasts this long per payment. Auto-renewing card subscriptions
// get a couple of days' grace, since Paystack charges by calendar month.
export const PERIOD_DAYS = 30
export const AUTO_RENEW_GRACE_DAYS = 2

const num = (value, fallback) => {
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

export function plansFromEnv(env = process.env) {
  const paidMaxChars = num(env.PAID_MAX_INPUT_CHARS, 40_000)
  const plans = {
    free: {
      id: 'free',
      name: 'Free',
      price: 0,
      // No separate 3-hour limit: the month's allowance can be used at once.
      windowNaira: num(env.FREE_WINDOW_NGN, 900),
      periodNaira: num(env.FREE_MONTH_NGN, 900),
      maxChars: num(env.FREE_MAX_INPUT_CHARS, 15_000),
      libraryPerDay: num(env.FREE_LIBRARY_PER_DAY, 5),
      youtubePerWindow: num(env.FREE_YOUTUBE_PER_WINDOW, 1),
      youtubePerMonth: num(env.FREE_YOUTUBE_PER_MONTH, 3),
    },
    // The cheaper paid plan: packs written by the fast model (Haiku), like
    // Free, but with theory questions, long lectures and a bigger allowance.
    plus: {
      id: 'plus',
      name: 'Plus',
      price: num(env.PLUS_PRICE_NGN, 2500),
      windowNaira: num(env.PLUS_WINDOW_NGN, 700),
      periodNaira: num(env.PLUS_MONTH_NGN, 1750),
      maxChars: paidMaxChars,
      libraryPerDay: num(env.PLUS_LIBRARY_PER_DAY, 10),
      youtubePerWindow: num(env.PLUS_YOUTUBE_PER_WINDOW, 3),
      youtubePerMonth: num(env.PLUS_YOUTUBE_PER_MONTH, 8),
    },
    pro: {
      id: 'pro',
      name: 'Pro',
      price: num(env.PRO_PRICE_NGN, 5000),
      windowNaira: num(env.PRO_WINDOW_NGN, 1500),
      periodNaira: num(env.PRO_MONTH_NGN, 3500),
      maxChars: paidMaxChars,
      libraryPerDay: num(env.PRO_LIBRARY_PER_DAY, 15),
      youtubePerWindow: num(env.PRO_YOUTUBE_PER_WINDOW, 5),
      youtubePerMonth: num(env.PRO_YOUTUBE_PER_MONTH, 15),
    },
    max: {
      id: 'max',
      name: 'Max',
      price: num(env.MAX_PRICE_NGN, 12000),
      windowNaira: num(env.MAX_WINDOW_NGN, 3000),
      periodNaira: num(env.MAX_MONTH_NGN, 8500),
      maxChars: paidMaxChars,
      libraryPerDay: num(env.MAX_LIBRARY_PER_DAY, 40),
      youtubePerWindow: num(env.MAX_YOUTUBE_PER_WINDOW, 10),
      youtubePerMonth: num(env.MAX_YOUTUBE_PER_MONTH, 30),
    },
  }
  // Features by plan. Theory questions add about ₦200 to a typical pack, so
  // they're on paid plans. Scanned notes: Pro up to PRO_SCAN_PAGES pages a
  // pack, Max up to MAX_SCAN_PAGES; pasted text is Max-only. Free and Plus
  // packs are written by the fast model (Haiku), about a third of Sonnet's
  // cost, so the same allowance makes about three times as many. Making
  // every part of a long lecture at once is for paid plans.
  const listed = (value, fallback) => (value ?? fallback).split(',').map((p) => p.trim())
  const theoryPlans = listed(env.THEORY_PLANS, 'plus,pro,max')
  const scanPlans = listed(env.SCAN_PLANS, 'pro,max')
  const scanPages = { pro: num(env.PRO_SCAN_PAGES, 10), max: num(env.MAX_SCAN_PAGES, 40) }
  const pastePlans = listed(env.PASTE_PLANS, 'max')
  const fastPlans = listed(env.FAST_MODEL_PLANS, 'free,plus')
  const batchPlans = listed(env.BATCH_PARTS_PLANS, 'plus,pro,max')
  // Diagram pages: pages that are mostly figures, sent to Claude as pictures
  // (src/lib/diagramPages.js), up to diagramPages per pack.
  const diagramPlans = listed(env.DIAGRAM_PLANS, 'pro,max')
  const diagramPages = num(env.MAX_DIAGRAM_PAGES, 10)
  for (const plan of Object.values(plans)) {
    plan.theory = theoryPlans.includes(plan.id)
    plan.scans = scanPlans.includes(plan.id)
    plan.scanPages = plan.scans ? (scanPages[plan.id] ?? 40) : 0
    plan.paste = pastePlans.includes(plan.id)
    plan.fastModel = fastPlans.includes(plan.id)
    plan.batchParts = batchPlans.includes(plan.id)
    plan.diagramPages = diagramPlans.includes(plan.id) ? diagramPages : 0
  }
  // A plan can't accept notes whose expected cost wouldn't fit in one window
  // (or its whole period): they'd be refused however long the student waited.
  for (const plan of Object.values(plans)) {
    plan.maxChars = Math.min(plan.maxChars, maxCharsWithin(Math.min(plan.windowNaira, plan.periodNaira), plan, env))
  }
  return plans
}

export const PAID_PLANS = ['plus', 'pro', 'max']

// A cautious rate, so a weaker naira doesn't quietly eat the margin. Update
// USD_TO_NGN when the rate moves.
export const nairaPerUsd = (env = process.env) => num(env.USD_TO_NGN, 1600)

// What a pack is expected to cost before it's written, from the length of the
// notes, with or without theory questions. Fitted to measured runs on Sonnet
// 4.6 at medium effort. Without theory: 11K characters cost $0.22, 27K $0.45,
// 40K $0.64. With theory, a roughly fixed amount per module is added: 11K
// cost $0.31-0.38, 40K $0.61. The real cost replaces the estimate once the
// pack is done. Refit if the model or effort changes.
const ESTIMATE = {
  plain: { base: 0.051, perChar: 0.0000147 },
  theory: { base: 0.242, perChar: 0.0000093 },
}
// `fast`: written by the fast model (Haiku, on plans with fastModel), which
// costs FAST_MODEL_COST_FACTOR of the above.
export function estimateCostUsd(chars, theory = false, pictures = 0, env = process.env, fast = false) {
  const { base, perChar } = theory ? ESTIMATE.theory : ESTIMATE.plain
  return (base + chars * perChar) * (fast ? fastCostFactor(env, theory) : 1) + pictures * pictureCostUsd(env)
}

// Measured on the EEE 207 lecture (11K characters) on Haiku 4.5, against the
// Sonnet 4.6 estimate: $0.086 against $0.214 without theory questions (0.40),
// and $0.089 against $0.344 with them (0.26, taken as 0.3 for some margin).
const fastCostFactor = (env, theory = false) =>
  theory ? num(env.FAST_MODEL_THEORY_COST_FACTOR, 0.3) : num(env.FAST_MODEL_COST_FACTOR, 0.4)

// One diagram page sent as a picture (about 1,400 input tokens at 1200 px):
// written to the prompt cache once (1.25x) and read by each other module
// (0.1x), plus what Claude writes about it. Measured on Sonnet 4.6 at medium
// effort; refit if the model or effort changes.
export const pictureCostUsd = (env = process.env) => num(env.DIAGRAM_PAGE_USD, 0.01)

export const toNaira = (usd, env = process.env) => Math.ceil(usd * nairaPerUsd(env))

// The longest notes whose estimate for `plan` is at most `naira` (the
// inverse of the above).
function maxCharsWithin(naira, plan, env) {
  const { base, perChar } = plan.theory ? ESTIMATE.theory : ESTIMATE.plain
  const factor = plan.fastModel ? fastCostFactor(env, plan.theory) : 1
  return Math.max(0, Math.floor((naira / nairaPerUsd(env) / factor - base) / perChar))
}
