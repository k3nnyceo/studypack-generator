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
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ring-1 transition active:scale-95 ${
        status === 'copied'
          ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
          : 'bg-white text-slate-600 ring-slate-300 hover:bg-slate-50'
      } ${className}`}
    >
      {status === 'copied' ? `✓ ${copiedLabel}` : status === 'failed' ? 'Copy failed' : label}
    </button>
  )
}
