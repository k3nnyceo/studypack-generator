// Feature flags, read from Vite env vars at build time (see .env.example).

// When true, the extracted-notes screen offers "Generate with Claude", which
// calls the API server (server/studyGuide.js). Off by default: study guides are
// pasted in as JSON instead, so no Claude API key or API cost is needed.
export const AI_GENERATION_ENABLED = import.meta.env.VITE_ENABLE_AI_GENERATION === 'true'

// The Google OAuth client id for "Sign in with Google" (public by design).
// When set, students can sign in to generate study packs (required for AI
// generation) and to sync their library across devices.
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ''
export const SIGN_IN_ENABLED = Boolean(GOOGLE_CLIENT_ID)
