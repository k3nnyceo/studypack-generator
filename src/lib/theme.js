import { useEffect, useState } from 'react'

// Dark mode. StudyPack follows the device's light or dark setting until the
// student picks one with the header's sun/moon button; that choice is kept on
// this device:
//   studypack.theme.v1 = 'light' | 'dark'
// index.html applies it before the page draws, so there's no white flash;
// the dark colours themselves are in src/index.css (html.dark).

export const THEME_KEY = 'studypack.theme.v1'
const BAR = { light: '#7440df', dark: '#141110' }

export function readChoice(storage = globalThis.localStorage) {
  try {
    const value = storage?.getItem(THEME_KEY)
    return value === 'light' || value === 'dark' ? value : null
  } catch {
    return null
  }
}

export const isDark = (choice, systemDark) => (choice ? choice === 'dark' : Boolean(systemDark))

function apply(dark) {
  const root = document.documentElement
  root.classList.toggle('dark', dark)
  root.style.colorScheme = dark ? 'dark' : 'light'
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? BAR.dark : BAR.light)
}

const systemQuery = () => window.matchMedia?.('(prefers-color-scheme: dark)')

// { dark, toggle }.
export function useTheme() {
  const [choice, setChoice] = useState(readChoice)
  const [systemDark, setSystemDark] = useState(() => Boolean(systemQuery()?.matches))
  const dark = isDark(choice, systemDark)

  useEffect(() => apply(dark), [dark])
  useEffect(() => {
    const query = systemQuery()
    if (!query) return
    const onChange = (e) => setSystemDark(e.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])
  // Another tab switching.
  useEffect(() => {
    const onStorage = (e) => e.key === THEME_KEY && setChoice(readChoice())
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  return {
    dark,
    toggle: () => {
      const next = dark ? 'light' : 'dark'
      try {
        localStorage.setItem(THEME_KEY, next)
      } catch {
        // Storage blocked: it lasts for this visit.
      }
      setChoice(next)
    },
  }
}
