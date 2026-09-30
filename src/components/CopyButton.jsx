import { Check, Copy } from 'lucide-react'
import { useEffect, useState } from 'react'

export default function CopyButton({ text, label = 'Copy', copiedLabel = 'Copied!', className = '' }) {
  const [status, setStatus] = useState('idle') // 'idle' | 'copied' | 'failed'

  useEffect(() => {
    if (status === 'idle') return
    const timer = setTimeout(() => setStatus('idle'), 2000)
    return () => clearTimeout(timer)
  }, [status])

  async function copy() {
    try {
      await navigator.clipboard.writeText(typeof text === 'function' ? text() : text)
      setStatus('copied')
    } catch {
      setStatus('failed')
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold ring-1 transition active:scale-95 ${
        status === 'copied'
          ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
          : 'bg-white text-stone-700 ring-stone-200 shadow-card hover:bg-stone-50'
      } ${className}`}
    >
      {status === 'copied' ? (
        <Check className="size-4" strokeWidth={2.5} aria-hidden />
      ) : (
        <Copy className="size-4" strokeWidth={2.25} aria-hidden />
      )}
      {status === 'copied' ? copiedLabel : status === 'failed' ? 'Copy failed' : label}
    </button>
  )
}
