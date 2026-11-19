// Vercel Function for /api/og?pack=<id>: a shared pack's preview picture. The
// logic lives in server/packPage.js and server/shareCard.js.
import { getDefaults } from '../server/billing.js'
import { handleOgImage } from '../server/packPage.js'

export default async function handler(req, res) {
  await handleOgImage(req, res, { store: getDefaults().store })
}
