// StudyPack's plans, and how a study pack's cost is counted against them.
//
// Usage works like Claude's own app: each pack uses part of an allowance in
// proportion to what it really cost (Claude's token bill, converted to naira),
// so a long lecture uses more than a short one. Two allowances apply at once:
//   - a 3-hour window, which refills at fixed times (00:00, 03:00, … UTC), so
//     one sitting can't use up the month, and
//   - a monthly allowance, which is what keeps a plan's cost below its price.
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
      windowNaira: num(env.FREE_WINDOW_NGN, 400),
      periodNaira: num(env.FREE_MONTH_NGN, 1000),
      maxChars: num(env.FREE_MAX_INPUT_CHARS, 13_000),
    },
    pro: {
      id: 'pro',
      name: 'Pro',
      price: num(env.PRO_PRICE_NGN, 3500),
      windowNaira: num(env.PRO_WINDOW_NGN, 1000),
      periodNaira: num(env.PRO_MONTH_NGN, 2300),
      maxChars: paidMaxChars,
    },
    max: {
      id: 'max',
      name: 'Max',
      price: num(env.MAX_PRICE_NGN, 6500),
      windowNaira: num(env.MAX_WINDOW_NGN, 2000),
      periodNaira: num(env.MAX_MONTH_NGN, 4600),
      maxChars: paidMaxChars,
    },
  }
  // A plan can't accept notes whose expected cost wouldn't fit in one window
  // (or its whole period): they'd be refused however long the student waited.
  for (const plan of Object.values(plans)) {
    plan.maxChars = Math.min(plan.maxChars, maxCharsWithin(Math.min(plan.windowNaira, plan.periodNaira), env))
  }
  return plans
}

export const PAID_PLANS = ['pro', 'max']

// A cautious rate, so a weaker naira doesn't quietly eat the margin. Update
// USD_TO_NGN when the rate moves.
export const nairaPerUsd = (env = process.env) => num(env.USD_TO_NGN, 1600)

// What a pack is expected to cost before it's written, from the length of the
// notes. Fitted to measured runs on Sonnet 4.6 at medium effort: 11K
// characters cost $0.22, 27K $0.45 and 40K $0.64. The real cost replaces it
// once the pack is done. Refit if the model or effort changes.
export function estimateCostUsd(chars) {
  return 0.051 + chars * 0.0000147
}

export const toNaira = (usd, env = process.env) => Math.ceil(usd * nairaPerUsd(env))

// The longest notes whose estimate is at most `naira` (the inverse of the above).
function maxCharsWithin(naira, env) {
  return Math.max(0, Math.floor((naira / nairaPerUsd(env) - 0.051) / 0.0000147))
}
