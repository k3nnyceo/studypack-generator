// Vercel Function for shared pack links (/?pack=<id>, sent here by
// middleware.js): the app's page with that pack's link-preview tags. The logic
// lives in server/packPage.js, shared with the local dev server.
import { getDefaults } from '../server/billing.js'
import { handlePackPage } from '../server/packPage.js'

export default async function handler(req, res) {
  await handlePackPage(req, res, { store: getDefaults().store })
}
