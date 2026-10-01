import { formatResetTime } from '../lib/billing.js'

// How much of the plan's allowance is used: this 3-hour session and this
// month, like Claude's own usage page. Shares only, never naira.
export default function UsageBars({ billing, compact = false }) {
  const { usage, plan } = billing
  const rows = [
    { label: 'This session', ...usage.window, note: 'Refills every 3 hours' },
    { label: plan === 'free' ? 'This month' : 'This plan period', ...usage.period, note: plan === 'free' ? 'Refills monthly' : 'Refills when you renew' },
  ]
  return (
    <div className={compact ? 'space-y-3' : 'space-y-4'}>
      {rows.map((row) => (
        <div key={row.label}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="font-semibold text-stone-800">{row.label}</span>
            <span className="text-stone-500 tabular-nums">{row.percent}% used</span>
          </div>
          <div
            className="mt-1.5 h-2 overflow-hidden rounded-full bg-stone-100"
            role="progressbar"
            aria-label={`${row.label} usage`}
            aria-valuenow={row.percent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className={`h-full rounded-full transition-[width] duration-500 ${row.percent >= 100 ? 'bg-amber-500' : 'bg-brand-500'}`}
              style={{ width: `${Math.max(row.percent, row.percent > 0 ? 3 : 0)}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-stone-500">
            {row.percent > 0 ? `Resets ${formatResetTime(row.resetsAt)}` : row.note}
          </p>
        </div>
      ))}
    </div>
  )
}
