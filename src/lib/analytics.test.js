// Run with: npm test
// Page views are counted per screen, with only the share-link and campaign
// parameters kept (src/lib/analytics.js).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { analyticsPath, cleanAnalyticsEvent } from './analytics.js'

const clean = (url) => cleanAnalyticsEvent({ type: 'pageview', url }).url

test('each screen is its own page', () => {
  assert.equal(analyticsPath('home'), '/')
  assert.equal(analyticsPath('flashcards'), '/flashcards')
  assert.equal(clean('https://studypack-generator.vercel.app/#/plans'), 'https://studypack-generator.vercel.app/plans')
  assert.equal(clean('https://studypack-generator.vercel.app/'), 'https://studypack-generator.vercel.app/')
})

test('share links and campaigns are kept; payment references and other parameters are not', () => {
  assert.equal(clean('https://studypack-generator.vercel.app/?ref=tiktok&utm_source=x'), 'https://studypack-generator.vercel.app/?ref=tiktok&utm_source=x')
  assert.equal(clean('https://studypack-generator.vercel.app/?billing=return&reference=T123&trxref=T123#/plans'), 'https://studypack-generator.vercel.app/plans')
  assert.equal(clean('https://studypack-generator.vercel.app/?share=1'), 'https://studypack-generator.vercel.app/')
})

test('the plain pages keep their own address, and odd input is passed through', () => {
  assert.equal(clean('https://studypack-generator.vercel.app/privacy.html'), 'https://studypack-generator.vercel.app/privacy.html')
  assert.deepEqual(cleanAnalyticsEvent({ type: 'pageview', url: 'not a url' }), { type: 'pageview', url: 'not a url' })
})
