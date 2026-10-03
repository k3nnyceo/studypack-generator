import { Link2, Loader2, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { formatNaira } from '../lib/billing.js'
import CopyButton from './CopyButton.jsx'
import { Button, Eyebrow } from './ui.jsx'

// For StudyPack's admins (ADMIN_EMAILS): which share links bring visits,
// sign-ups and paying students, plus a builder for new links.
export default function ReferralStats() {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')
  const [code, setCode] = useState('')

  const load = useCallback(() => {
    fetch('/api/referrals', { cache: 'no-store' })
      .then(async (res) => {
        const data = await res.json().catch(() => null)
        if (!res.ok || !data) throw new Error(data?.error || 'Couldn’t load the stats.')
        setRows(data.rows)
        setError('')
      })
      .catch((err) => setError(err.message))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const clean = code.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 32)
  const link = `${window.location.origin}/?ref=${clean}`
  const total = (key) => (rows ?? []).reduce((n, r) => n + (r[key] ?? 0), 0)

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>Admin</Eyebrow>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-stone-900">Where students come from</h1>
          <p className="mt-1 max-w-2xl text-stone-500">
            Each student counts for the first link they arrived through, so their sign-up and payments are credited to it.
          </p>
        </div>
        <Button size="sm" variant="ghost" icon={RefreshCw} onClick={load}>
          Refresh
        </Button>
      </div>

      <section className="card space-y-3 p-5" aria-label="Make a link">
        <label htmlFor="ref-code" className="flex items-center gap-2 font-semibold text-stone-900">
          <Link2 className="size-4 text-brand-600" strokeWidth={2.25} aria-hidden />
          Make a share link
        </label>
        <p className="text-sm text-stone-500">One per channel or ambassador: tiktok, whatsapp-eee, ada…</p>
        <div className="flex flex-wrap items-center gap-3">
          <input
            id="ref-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="tiktok"
            className="h-10 w-40 rounded-lg border border-stone-300 bg-white px-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
          />
          {clean && (
            <>
              <code className="min-w-0 break-all rounded-lg bg-stone-100 px-3 py-2 text-sm text-stone-800">{link}</code>
              <CopyButton text={link} label="Copy link" />
            </>
          )}
        </div>
      </section>

      {error && <p className="text-sm text-rose-700">{error}</p>}
      {!rows && !error && (
        <div className="flex justify-center py-12" role="status">
          <Loader2 className="size-6 animate-spin text-brand-600" aria-label="Loading" />
        </div>
      )}
      {rows && (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[34rem] text-left text-sm">
            <thead className="border-b border-stone-200 text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Link</th>
                <th className="px-4 py-3 text-right font-semibold">Visits</th>
                <th className="px-4 py-3 text-right font-semibold">Sign-ups</th>
                <th className="px-4 py-3 text-right font-semibold">Paying students</th>
                <th className="px-4 py-3 text-right font-semibold">Payments</th>
                <th className="px-4 py-3 text-right font-semibold">Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 tabular-nums">
              {rows.map((r) => (
                <tr key={r.ref}>
                  <td className="px-4 py-3 font-semibold text-stone-900">{r.ref === 'direct' ? 'No link (direct)' : r.ref}</td>
                  <td className="px-4 py-3 text-right">{r.visits ?? '–'}</td>
                  <td className="px-4 py-3 text-right">{r.signups}</td>
                  <td className="px-4 py-3 text-right">{r.payers}</td>
                  <td className="px-4 py-3 text-right">{r.payments}</td>
                  <td className="px-4 py-3 text-right">{formatNaira(r.revenue)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-stone-200 font-semibold text-stone-900 tabular-nums">
              <tr>
                <td className="px-4 py-3">Total</td>
                <td className="px-4 py-3 text-right">{total('visits')}</td>
                <td className="px-4 py-3 text-right">{total('signups')}</td>
                <td className="px-4 py-3 text-right">{total('payers')}</td>
                <td className="px-4 py-3 text-right">{total('payments')}</td>
                <td className="px-4 py-3 text-right">{formatNaira(total('revenue'))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
