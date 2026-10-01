import { useEffect, useRef, useState } from 'react'
import { loadGoogle } from '../lib/auth.js'

// Google's own "Sign in with Google" button (its look is set by Google's
// branding rules). The credential goes to useAuth's signIn, wherever this is
// rendered. `type="icon"` is the compact square "G" for tight spaces.
export default function GoogleButton({ text = 'signin_with', size = 'large', type = 'standard', className = '' }) {
  const ref = useRef(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    loadGoogle()
      .then((id) => {
        if (cancelled || !ref.current) return
        id.renderButton(ref.current, { type, theme: 'outline', size, text, shape: 'pill', logo_alignment: 'left' })
      })
      .catch((err) => !cancelled && setError(err.message))
    return () => {
      cancelled = true
    }
  }, [text, size, type])

  if (error) return <p className="text-sm text-rose-700">{error}</p>
  // Reserves the button's height so the layout doesn't jump when it appears.
  return <div ref={ref} className={`${size === 'large' ? 'min-h-10' : 'min-h-8'} ${className}`} />
}
