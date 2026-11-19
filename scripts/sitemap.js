// Writes dist/sitemap.xml after the build (npm run build): the home page, the
// privacy and terms pages, and one link per ready-made pack (/?pack=<id>),
// whose page carries that pack's own title (server/packPage.js), so search
// engines can list them. Generated at build time because the Hobby plan has
// no room for another server function. Packs students share aren't included.
import { writeFileSync } from 'node:fs'
import { readyMadeSummaries } from '../server/shared.js'

const SITE = (process.env.SITE_URL || 'https://studypack-generator.vercel.app').replace(/\/+$/, '')
const today = new Date().toISOString().slice(0, 10)
const escapeXml = (s) => s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c])

const pages = [
  { loc: `${SITE}/`, priority: '1.0' },
  { loc: `${SITE}/privacy.html`, priority: '0.2' },
  { loc: `${SITE}/terms.html`, priority: '0.2' },
  ...readyMadeSummaries().map((pack) => ({ loc: `${SITE}/?pack=${pack.id}`, priority: '0.8' })),
]

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map((p) => `  <url><loc>${escapeXml(p.loc)}</loc><lastmod>${today}</lastmod><priority>${p.priority}</priority></url>`).join('\n')}
</urlset>
`
writeFileSync(new URL('../dist/sitemap.xml', import.meta.url), xml)
console.log(`sitemap.xml: ${pages.length} pages`)
