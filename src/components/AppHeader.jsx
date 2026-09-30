import { BookOpen, FileText, Layers, Library, ListChecks, Plus } from 'lucide-react'
import { Button, Logo } from './ui.jsx'

// Sticky top bar. Once a file is loaded it carries the Notes / Study guide /
// Flashcards / Quiz tabs, so the study views are always one click apart.
export default function AppHeader({ view, onNavigate, onReset, fileName, hasNotes, guide, counts, libraryCount }) {
  const showTabs = !['home', 'library'].includes(view) && (hasNotes || guide)

  const tabs = [
    hasNotes && { id: 'notes', label: 'Notes', short: 'Notes', icon: FileText },
    { id: 'guide', label: 'Study guide', short: 'Guide', icon: BookOpen },
    { id: 'flashcards', label: 'Flashcards', short: 'Cards', icon: Layers, count: counts.flashcards },
    { id: 'quiz', label: 'Quiz', short: 'Quiz', icon: ListChecks, count: counts.quiz },
  ].filter(Boolean)

  return (
    <header className="sticky top-0 z-30 border-b border-stone-200/80 bg-white/75 backdrop-blur-xl backdrop-saturate-150">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
        <Logo />

        {showTabs && (
          <nav
            aria-label="Study views"
            className="order-last w-full md:order-none md:mx-auto md:w-auto"
          >
            <div role="tablist" className="grid auto-cols-fr grid-flow-col gap-1 rounded-xl bg-stone-100 p-1 ring-1 ring-stone-200/60 md:inline-grid">
              {tabs.map((tab) => {
                const locked = tab.id !== 'notes' && !guide
                const active = view === tab.id
                return (
                  <button
                    key={tab.id}
                    role="tab"
                    aria-selected={active}
                    disabled={locked}
                    title={locked ? 'Load a study guide to unlock this' : undefined}
                    onClick={() => onNavigate(tab.id)}
                    className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition duration-200 disabled:cursor-not-allowed disabled:opacity-40 md:px-4 ${
                      active
                        ? 'bg-white text-stone-900 shadow-card ring-1 ring-stone-200/80'
                        : 'text-stone-600 hover:text-stone-900'
                    }`}
                  >
                    <tab.icon
                      className={`size-4 ${active ? 'text-brand-600' : ''}`}
                      strokeWidth={2.25}
                      aria-hidden
                    />
                    <span className="sm:hidden">{tab.short}</span>
                    <span className="hidden sm:inline">{tab.label}</span>
                    {guide && tab.count !== undefined && (
                      <span
                        className={`hidden rounded-md px-1.5 py-0.5 text-[11px] leading-none font-bold tabular-nums sm:inline ${
                          active ? 'bg-brand-100 text-brand-700' : 'bg-stone-200/70 text-stone-600'
                        }`}
                      >
                        {tab.count}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </nav>
        )}

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => onNavigate('library')}
            aria-current={view === 'library' ? 'page' : undefined}
            className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition ${
              view === 'library'
                ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-200'
                : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'
            }`}
          >
            <Library className="size-4" strokeWidth={2.25} aria-hidden />
            Library
            {libraryCount > 0 && (
              <span className="rounded-md bg-stone-200/70 px-1.5 py-0.5 text-[11px] leading-none font-bold text-stone-600 tabular-nums">
                {libraryCount}
              </span>
            )}
          </button>
          {view !== 'home' && view !== 'library' && (
            <>
              {fileName && (
                <span
                  className="hidden max-w-[13rem] items-center gap-2 truncate rounded-lg px-2 py-1 text-sm text-stone-500 lg:flex"
                  title={fileName}
                >
                  <FileText className="size-4 shrink-0 text-stone-500" aria-hidden />
                  <span className="truncate">{fileName}</span>
                </span>
              )}
              <Button size="sm" icon={Plus} onClick={onReset}>
                New
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
