// The picture X, WhatsApp and others show for a shared pack link
// (/api/og?pack=<id>, linked from server/packPage.js): 1200×630 PNG in
// StudyPack's colours, drawn with @vercel/og. X shows only the picture (no
// title) under a link, so the pack's name is in the picture itself.
import { readFileSync } from 'node:fs'
import { ImageResponse } from '@vercel/og'
import { packLabel } from '../src/lib/shareLinks.js'

// Plus Jakarta Sans (SIL Open Font License, server/fonts/OFL.txt) and the app icon.
const fontBold = readFileSync(new URL('./fonts/plus-jakarta-sans-latin-800-normal.woff', import.meta.url))
const fontSemi = readFileSync(new URL('./fonts/plus-jakarta-sans-latin-600-normal.woff', import.meta.url))
const icon = `data:image/png;base64,${readFileSync(new URL('../public/icon-512.png', import.meta.url)).toString('base64')}`

export const CARD_FONTS = [
  { name: 'Jakarta', data: fontBold, weight: 800, style: 'normal' },
  { name: 'Jakarta', data: fontSemi, weight: 600, style: 'normal' },
]

// A tiny createElement, so this file needs no JSX build step.
export const h = (type, style, ...children) => ({ type, props: { style: { display: 'flex', ...style }, children: children.flat().filter((c) => c !== null && c !== false) } })
export const img = (src, style) => ({ type: 'img', props: { src, style } })
export const STUDYPACK_ICON = icon

const clip = (text, max) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text)

// The card's layout, for a pack summary ({ course, title, topic, modules }).
export function packCardElement(pack) {
  const label = packLabel({ course: pack.course, title: pack.topic || pack.title })
  const topic = clip(pack.topic || pack.title || '', 70)
  const course = pack.course && pack.course !== label ? clip(pack.course.replace(/^[A-Z]{2,4} ?\d{3}[A-Z]?\s*[—:-]?\s*/, ''), 60) : ''
  const modules = pack.modules && !/module/i.test(topic) ? `${pack.modules} module${pack.modules === 1 ? '' : 's'} · ` : ''
  return h(
    'div',
    {
      width: '100%',
      height: '100%',
      flexDirection: 'column',
      justifyContent: 'space-between',
      padding: '64px 72px',
      background: 'linear-gradient(135deg, #8759ee 0%, #6231c4 55%, #43257f 100%)',
      color: '#ffffff',
      fontFamily: 'Jakarta',
    },
    h(
      'div',
      { alignItems: 'center', gap: 20 },
      img(icon, { width: 72, height: 72, borderRadius: 18 }),
      h('div', { fontSize: 36, fontWeight: 800 }, 'StudyPack'),
      h('div', { marginLeft: 'auto', padding: '10px 22px', borderRadius: 999, background: '#fde68a', color: '#43257f', fontSize: 26, fontWeight: 800 }, 'Free study pack'),
    ),
    h(
      'div',
      { flexDirection: 'column', gap: 12 },
      h('div', { fontSize: label.length > 14 ? 76 : 112, fontWeight: 800, lineHeight: 1.02, letterSpacing: -2 }, label),
      topic ? h('div', { fontSize: 44, fontWeight: 600, lineHeight: 1.2, color: 'rgba(255,255,255,0.92)' }, topic) : null,
      course ? h('div', { fontSize: 30, fontWeight: 600, color: 'rgba(255,255,255,0.7)' }, course) : null,
    ),
    h(
      'div',
      { alignItems: 'center', justifyContent: 'space-between', fontSize: 28, fontWeight: 600 },
      h('div', { color: 'rgba(255,255,255,0.88)' }, `${modules}Study guide · Flashcards · Quiz`),
      h('div', { color: 'rgba(255,255,255,0.7)' }, 'studypack-generator.vercel.app'),
    ),
  )
}

export const packCardImage = (pack) => new ImageResponse(packCardElement(pack), { width: 1200, height: 630, fonts: CARD_FONTS })
