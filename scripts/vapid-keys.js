// Makes the key pair for daily reminders (server/reminders.js), and a cron
// secret. Run it yourself, then paste each value into Vercel →
// studypack-generator → Settings → Environment Variables (Production), and
// redeploy:
//
//   node scripts/vapid-keys.js
//
// Keep the private key and the secret to yourself. Changing the keys later
// means every student has to turn reminders on again.
import { randomBytes } from 'node:crypto'
import webpush from 'web-push'

const { publicKey, privateKey } = webpush.generateVAPIDKeys()
console.log(`VAPID_PUBLIC_KEY=${publicKey}`)
console.log(`VAPID_PRIVATE_KEY=${privateKey}`)
console.log(`CRON_SECRET=${randomBytes(24).toString('base64url')}`)
