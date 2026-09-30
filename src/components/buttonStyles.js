// Button class names, shared by <Button> and elements styled as buttons (e.g. file-input labels).
const BUTTON_BASE =
  'inline-flex shrink-0 items-center justify-center font-semibold whitespace-nowrap transition duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50'

const BUTTON_VARIANTS = {
  primary: 'bg-brand-600 text-white shadow-brand hover:bg-brand-700',
  secondary: 'bg-white text-stone-700 ring-1 ring-stone-200 shadow-card hover:bg-stone-50 hover:text-stone-900',
  soft: 'bg-brand-50 text-brand-700 hover:bg-brand-100',
  ghost: 'text-stone-600 hover:bg-stone-100 hover:text-stone-900',
}

const BUTTON_SIZES = {
  sm: 'h-8 gap-1.5 rounded-lg px-3 text-sm',
  md: 'h-10 gap-2 rounded-xl px-4 text-sm',
  lg: 'h-12 gap-2 rounded-xl px-6 text-base',
}

export function buttonClasses({ variant = 'secondary', size = 'md', className = '' } = {}) {
  return `${BUTTON_BASE} ${BUTTON_VARIANTS[variant]} ${BUTTON_SIZES[size]} ${className}`
}
