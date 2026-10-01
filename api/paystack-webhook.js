// Vercel Function for /api/paystack-webhook: Paystack's payment and
// subscription events. Set this URL in Paystack → Settings → API Keys & Webhooks.
import { handlePaystackWebhook } from '../server/billing.js'

export default async function handler(req, res) {
  // The signature covers the body as sent. Vercel has parsed it by now;
  // Paystack sends compact JSON, so re-serialising gives back the same bytes
  // (as in Paystack's own examples).
  const raw = typeof req.body === 'string' ? req.body : Buffer.isBuffer(req.body) ? req.body.toString('utf8') : JSON.stringify(req.body ?? {})
  await handlePaystackWebhook(req, res, raw)
}
