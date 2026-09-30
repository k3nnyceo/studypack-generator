// Shared UI building blocks, so every screen uses the same buttons and badges.
import { GraduationCap } from 'lucide-react'
import { buttonClasses } from './buttonStyles.js'

export function Button({ variant, size, className, icon: Icon, children, ...props }) {
  return (
    <button type="button" className={buttonClasses({ variant, size, className })} {...props}>
      {Icon && <Icon className={size === 'lg' ? 'size-5' : 'size-4'} strokeWidth={2.25} aria-hidden />}
      {children}
    </button>
  )
}

const BADGE_TONES = {
  brand: 'bg-brand-50 text-brand-700 ring-brand-200/70',
  stone: 'bg-stone-100 text-stone-600 ring-stone-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
}

export function Badge({ tone = 'stone', className = '', children, ...props }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${BADGE_TONES[tone]} ${className}`}
      {...props}
    >
      {children}
    </span>
  )
}

export function Logo() {
  return (
    <span className="flex items-center gap-2.5">
      <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-800 text-white shadow-brand">
        <GraduationCap className="size-5" strokeWidth={2.25} aria-hidden />
      </span>
      <span className="text-lg font-bold tracking-tight text-stone-900">StudyPack</span>
    </span>
  )
}

// A small uppercase label that sits above headings.
export function Eyebrow({ className = '', children }) {
  return <p className={`text-xs font-semibold uppercase tracking-[0.08em] text-brand-600 ${className}`}>{children}</p>
}
