// Vercel Function for shared pack links: the page (/?pack=<id>, sent here by
// middleware.js) and its preview picture (?image=1). One function for both,
// because the Hobby plan allows 12 per deployment. The logic lives in
// server/packPage.js, shared with the local dev server.
import { getDefaults } from '../server/billing.js'
import { handleOgImage, handlePackPage } from '../server/packPage.js'

export default async function handler(req, res) {
  const wantsImage = new URL(req.url, 'http://localhost').searchParams.has('image')
  await (wantsImage ? handleOgImage : handlePackPage)(req, res, { store: getDefaults().store })
}
