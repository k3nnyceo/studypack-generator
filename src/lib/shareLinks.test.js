// Run with: npm test
// Share links and messages for X and WhatsApp (src/lib/shareLinks.js).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { packLabel, packMessage, scoreMessage, shareUrl, takePackParam, whatsappShareUrl, xShareUrl } from './shareLinks.js'

const origin = 'https://studypack-generator.vercel.app'
const id = '1a2b3c4d-1a2b-1a2b-1a2b-1a2b3c4d5e6f'

test('links point to the home page or a pack, with a ref', () => {
  assert.equal(shareUrl({ origin }), `${origin}/`)
  assert.equal(shareUrl({ origin, ref: 'i-abc1234' }), `${origin}/?ref=i-abc1234`)
  assert.equal(shareUrl({ origin, packId: id, ref: 'share-pack' }), `${origin}/?pack=${id}&ref=share-pack`)
})

test('X and WhatsApp share addresses carry the text and link', () => {
  const x = new URL(xShareUrl('I scored 9/10 🔥', `${origin}/?ref=i-abc1234`))
  assert.equal(x.origin + x.pathname, 'https://x.com/intent/post')
  assert.equal(x.searchParams.get('text'), 'I scored 9/10 🔥')
  assert.equal(x.searchParams.get('url'), `${origin}/?ref=i-abc1234`)
  const wa = new URL(whatsappShareUrl('Free pack', `${origin}/`))
  assert.equal(wa.searchParams.get('text'), `Free pack ${origin}/`)
  assert.doesNotMatch(whatsappShareUrl('Free pack', `${origin}/`), /\+/)
})

test('packs are named by their course code when they have one', () => {
  assert.equal(packLabel({ course: 'CHM 101 — General Chemistry I (full course)' }), 'CHM 101')
  assert.equal(packLabel({ course: 'BIOL 1010 Cell Biology' }), 'BIOL 1010 Cell Biology')
  assert.equal(packLabel({ title: 'MTH101: Elementary Mathematics I' }), 'MTH 101')
  assert.equal(packLabel({ title: 'Strength of Materials' }), 'Strength of Materials')
  assert.equal(packLabel({ title: 'A'.repeat(60) }).length, 46)
  assert.equal(packLabel({}), 'my lecture')
})

test('good scores are shown off; low ones share the pack instead', () => {
  assert.match(scoreMessage({ correct: 10, total: 10, label: 'MTH 101' }), /^I scored 10\/10 on the MTH 101 quiz on StudyPack 💯/)
  assert.match(scoreMessage({ correct: 8, total: 10, label: 'MTH 101' }), /8\/10 .*🔥/)
  assert.match(scoreMessage({ correct: 6, total: 10, label: 'MTH 101' }), /6\/10 .*💪/)
  assert.match(scoreMessage({ correct: 3, total: 10, label: 'MTH 101' }), /^Studying MTH 101 with StudyPack/)
  assert.doesNotMatch(scoreMessage({ correct: 3, total: 10, label: 'MTH 101' }), /3\/10/)
  assert.match(packMessage({ label: 'PHY 102' }), /^Free PHY 102 study pack/)
})

test('a ?pack= link is read once and removed from the address', () => {
  const calls = []
  globalThis.window = {
    location: { href: `${origin}/?ref=x&pack=${id}#/explore` },
    history: { state: null, replaceState: (_s, _t, url) => calls.push(url) },
  }
  assert.equal(takePackParam(), id)
  assert.deepEqual(calls, ['/?ref=x#/explore'])
  window.location.href = `${origin}/?pack=not-an-id`
  assert.equal(takePackParam(), null)
  window.location.href = `${origin}/`
  assert.equal(takePackParam(), null)
  delete globalThis.window
})
