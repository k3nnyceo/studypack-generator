// Run with: npm test
// Link previews for shared packs (server/packPage.js): the page gets the
// pack's title, description and picture; unknown packs get the normal page.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { handleOgImage, handlePackPage, withPackPreview } from './packPage.js'
import { memoryStore } from './usageLimits.js'

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const origin = 'https://studypack-generator.vercel.app'
const MTH101 = '830f6007-c8d0-3a0d-b482-4f45a53473a0' // a ready-made pack

function fakeRes() {
  return {
    headers: {},
    writeHead(status, headers = {}) {
      this.status = status
      Object.assign(this.headers, headers)
    },
    end(body) {
      this.body = body
    },
  }
}
const req = (url) => ({ url, headers: { host: 'studypack-generator.vercel.app', 'x-forwarded-proto': 'https' }, socket: {} })

test('a pack link gets the pack in its preview tags', () => {
  const pack = { id: MTH101, course: 'MTH 101 Elementary Mathematics I', topic: 'Full course: 6 modules', title: 'MTH 101 — Elementary Mathematics I' }
  const out = withPackPreview(html, pack, origin)
  assert.match(out, /<title>MTH 101: free study pack · Full course: 6 modules \| StudyPack<\/title>/)
  assert.match(out, new RegExp(`<meta property="og:image" content="${origin}/api/pack-page\\?image=1&amp;pack=${MTH101}"`))
  assert.match(out, new RegExp(`<meta name="twitter:image" content="${origin}/api/pack-page\\?image=1&amp;pack=${MTH101}"`))
  assert.match(out, new RegExp(`<meta property="og:url" content="${origin}/\\?pack=${MTH101}"`))
  assert.match(out, /<meta property="og:description" content="Study guide, worked examples, flashcards and a quiz for MTH 101 Elementary Mathematics I\. Free on StudyPack\."/)
  // The rest of the page (the app itself) is untouched.
  assert.equal(out.match(/<script/g)?.length, html.match(/<script/g)?.length)
})

test('pack names from students are escaped', () => {
  const out = withPackPreview(html, { id: MTH101, topic: 'Tricky "quotes" <script>', title: 'x' }, origin)
  assert.doesNotMatch(out, /"quotes" <script>/, "the student's text never becomes a tag")
  assert.match(out, /Tricky &quot;quotes&quot; &lt;script&gt;/)
})

test('the page handler serves the pack preview, or the normal page for an unknown pack', async () => {
  const load = async () => html
  const known = fakeRes()
  await handlePackPage(req(`/api/pack-page?pack=${MTH101}&ref=i-abc1234`), known, { store: memoryStore(), env: {}, load })
  assert.equal(known.status, 200)
  assert.match(known.body, /og:image" content="https:\/\/studypack-generator\.vercel\.app\/api\/pack-page\?image=1&amp;pack=/)
  const unknown = fakeRes()
  await handlePackPage(req('/api/pack-page?pack=00000000-0000-0000-0000-000000000000'), unknown, { store: memoryStore(), env: {}, load })
  assert.equal(unknown.body, html)
  const broken = fakeRes()
  await handlePackPage(req(`/api/pack-page?pack=${MTH101}`), broken, { store: memoryStore(), env: {}, load: async () => { throw new Error('down') } })
  assert.equal(broken.status, 302)
})

test('the picture is drawn for a known pack; an unknown one gets the site picture', async () => {
  const drawn = fakeRes()
  let drew
  await handleOgImage(req(`/api/pack-page?image=1&pack=${MTH101}`), drawn, {
    store: memoryStore(),
    render: (pack) => ((drew = pack), new Response(new Uint8Array([137, 80, 78, 71]))),
  })
  assert.equal(drawn.status, 200)
  assert.equal(drawn.headers['Content-Type'], 'image/png')
  assert.equal(drew.course, 'MTH 101 Elementary Mathematics I')
  const unknown = fakeRes()
  await handleOgImage(req('/api/pack-page?image=1&pack=nope'), unknown, { store: memoryStore() })
  assert.equal(unknown.status, 302)
  assert.equal(unknown.headers.Location, '/og-image.jpg')
})
