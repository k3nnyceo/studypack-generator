// "New in StudyPack": short announcements on the home and Today screens for
// students who've been here before, one at a time, newest first. Closing one
// (or following its link) hides it on this device and shows the next.
//
// To announce something, add it to the top of the list with a new id. `view`
// opens a StudyPack screen; `url` opens a link; `needs` hides an item whose
// link isn't set up. `discordUrl` is DISCORD_URL from src/config.js.
export const announcements = (discordUrl) => [
  {
    id: '2026-11-ask-library',
    title: 'Ask your whole library',
    body: 'Ask one question across all your study packs: what to revise first, how topics connect, or a quick quiz. Answers show which pack they come from.',
    cta: { label: 'Ask your library', view: 'library' },
  },
  {
    id: '2026-11-progress-sync',
    title: 'Your progress now follows you',
    body: 'Sign in with the same account on your phone and laptop: your XP, streak, exam plan and flashcards stay in step on both.',
  },
  {
    id: '2026-11-exam-plan',
    title: 'Exam countdown and a daily plan',
    body: 'Add your exam dates on Today, and StudyPack plans what to study each day: cards to review, guides, quizzes and mock exams. +5 XP for every task done.',
    cta: { label: 'Add your exams', view: 'today' },
  },
  {
    id: '2026-11-due-today',
    title: 'Flashcards due today, from all your packs',
    body: 'The Today screen now lists the cards to review from every pack, so nothing slips before your exam.',
    cta: { label: 'Open Today', view: 'today' },
  },
  {
    id: '2026-11-semester-pass',
    title: 'Semester pass: 4 months of Pro for ₦25,000',
    body: 'One payment for the whole semester, ₦5,000 less than paying monthly. Your allowance refills every 30 days.',
    cta: { label: 'See plans', view: 'plans' },
  },
  {
    id: '2026-11-discord',
    title: 'Join the StudyPack Discord',
    body: 'Ask for a pack for your course, get help with a topic, and tell us what to build next.',
    cta: { label: 'Join the Discord', url: discordUrl },
    needs: discordUrl,
  },
  {
    id: '2026-11-share-score',
    title: 'Share your quiz score on X and WhatsApp',
    body: 'After a quiz, share your score or the pack. Friends who join through your link earn you free days.',
  },
]

const KEY = 'studypack.whatsNew.dismissed'

export function readDismissed(storage = globalThis.localStorage) {
  try {
    const ids = JSON.parse(storage?.getItem(KEY) ?? '[]')
    return Array.isArray(ids) ? ids : []
  } catch {
    return []
  }
}

export function dismiss(id, storage = globalThis.localStorage) {
  const ids = [...new Set([...readDismissed(storage), id])]
  try {
    storage?.setItem(KEY, JSON.stringify(ids))
  } catch {
    // Storage blocked: it just shows again next visit.
  }
  return ids
}

// The announcement to show, or null: the newest not yet dismissed, skipping
// ones that aren't set up and ones that link to the screen already open.
export function nextAnnouncement(dismissed, currentView, list) {
  return list.find((a) => !dismissed.includes(a.id) && (!('needs' in a) || a.needs) && a.cta?.view !== currentView) ?? null
}
