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
  return {
    free: {
      id: 'free',
      name: 'Free',
      price: 0,
      windowNaira: num(env.FREE_WINDOW_NGN, 400),
      periodNaira: num(env.FREE_MONTH_NGN, 1000),
      maxChars: num(env.FREE_MAX_INPUT_CHARS, 15_000),
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
}

export const PAID_PLANS = ['pro', 'max']

// A cautious rate, so a weaker naira doesn't quietly eat the margin. Update
// USD_TO_NGN when the rate moves.
export const nairaPerUsd = (env = process.env) => num(env.USD_TO_NGN, 1600)

// What a pack is expected to cost before it's written, from the length of the
// notes. Fitted to measured runs (a 23-page, 11K-character lecture cost about
// $0.22 on Sonnet 4.6); the real cost replaces it once the pack is done.
export function estimateCostUsd(chars) {
  return 0.1 + chars * 0.0000095
}

export const toNaira = (usd, env = process.env) => Math.ceil(usd * nairaPerUsd(env))
