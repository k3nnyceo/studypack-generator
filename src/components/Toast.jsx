import { CircleCheck, TriangleAlert, X } from 'lucide-react'
import { useEffect } from 'react'

// A short-lived message pinned to the bottom of the screen, with an optional
// action such as "Undo". `toast` is { id, message, tone, action?: { label, onClick } }.
export default function Toast({ toast, onDismiss }) {
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(onDismiss, toast.action ? 7000 : 3500)
    return () => clearTimeout(timer)
  }, [toast, onDismiss])

  if (!toast) return null
  const Icon = toast.tone === 'error' ? TriangleAlert : CircleCheck

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
      <div
        key={toast.id}
        role={toast.tone === 'error' ? 'alert' : 'status'}
        className="animate-page-in pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl bg-stone-900 py-3 pr-3 pl-4 text-sm text-white shadow-elevated"
      >
        <Icon
          className={`size-4 shrink-0 ${toast.tone === 'error' ? 'text-rose-300' : 'text-brand-300'}`}
          strokeWidth={2.5}
          aria-hidden
        />
        <span>{toast.message}</span>
        {toast.action && (
          <button
            type="button"
            onClick={() => {
              toast.action.onClick()
              onDismiss()
            }}
            className="ml-1 rounded-lg px-2.5 py-1 font-semibold text-brand-200 transition hover:bg-white/10 hover:text-white"
          >
            {toast.action.label}
          </button>
        )}
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="rounded-lg p-1 text-stone-400 transition hover:bg-white/10 hover:text-white"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  )
}
