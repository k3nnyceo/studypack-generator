import { RefreshCw, X } from 'lucide-react'
import { Component } from 'react'
import { isStaleBuildError } from '../lib/staleBuild.js'
import { Button } from './ui.jsx'

// Around parts of the app that are loaded when first needed (the source
// viewer). If one can't load, this shows why instead of the whole page going
// blank: usually StudyPack was updated while the page was open, and the old
// version's files are gone from the server.
export default class LoadBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error) {
    console.error('Couldn’t open this part of StudyPack:', error)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    const stale = isStaleBuildError(error)
    const close = () => {
      this.setState({ error: null })
      this.props.onClose?.()
    }
    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-stone-950/40 p-4 sm:items-center" role="presentation">
        <div role="alertdialog" aria-labelledby="load-error-title" className="w-full max-w-md rounded-3xl bg-white p-6 shadow-elevated">
          <h2 id="load-error-title" className="text-lg font-bold text-stone-900">
            {stale ? 'StudyPack has been updated' : 'This couldn’t be opened'}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-stone-600">
            {stale
              ? 'A new version came out while this page was open. Reload to get it; your library and study packs are saved on this device.'
              : 'Something went wrong opening this. Try again, or reload the page.'}
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button variant="primary" icon={RefreshCw} onClick={() => window.location.reload()}>
              Reload StudyPack
            </Button>
            <Button variant="ghost" icon={X} onClick={close}>
              Close
            </Button>
          </div>
        </div>
      </div>
    )
  }
}
