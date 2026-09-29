// A pill-shaped filter toggle, used by the flashcard and quiz views.
export default function FilterChip({ active, onClick, children, title }) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={`inline-flex shrink-0 items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium ring-1 transition active:scale-95 ${
        active
          ? 'bg-slate-900 text-white ring-slate-900'
          : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50 hover:text-slate-900'
      }`}
    >
      {children}
    </button>
  )
}
