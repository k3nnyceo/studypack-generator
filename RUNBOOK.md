# StudyPack runbook

How to run StudyPack day to day: deploy, roll back, change prices, read the
logs, handle refunds and deletion requests, and fix the usual problems.
Written November 2026. The technical details of how the code works are in
`README.md`; this file is for operating it.

## Where everything lives

| What | Where |
|---|---|
| The site | https://studypack-generator.vercel.app |
| Code | https://github.com/k3nnyceo/studypack-generator (branch `master`) |
| Hosting, settings, logs, analytics | Vercel → team **SwiftPOS** → project **studypack-generator** |
| Database (accounts, plans, usage, synced libraries) | Upstash Redis, opened from Vercel → studypack-generator → **Storage** |
| AI (Claude) | AWS console → **Amazon Bedrock** (region `us-east-1`), billed on your AWS account |
| Payments in naira | Paystack dashboard |
| Payments in dollars | Gumroad (the Pro product is set up) |
| Google sign-in | Google Cloud console → APIs & Services → Credentials / OAuth consent screen |
| Sign-in code emails | Brevo |
| YouTube captions | Supadata dashboard |
| Privacy policy / terms | `public/privacy.html`, `public/terms.html` (live at `/privacy.html`, `/terms.html`) |

## Deploying

Every push to `master` on GitHub deploys to the live site automatically, in
about a minute. Watch it in Vercel → studypack-generator → **Deployments**: a
green **Ready** means it's live.

```bash
npm test
git push origin master
```

Run `npm test` before pushing; all tests should pass.

**After changing a setting** (an environment variable) in Vercel, it does
nothing until the next deploy. Go to **Deployments**, open the latest one,
**⋯ → Redeploy**. Settings starting with `VITE_` are baked into the page when
it's built, so they always need a redeploy.

## Rolling back (the site is broken after a deploy)

1. Vercel → studypack-generator → **Deployments**.
2. Find the last deployment that worked (they're listed newest first).
3. **⋯ → Promote to Production**. The live site switches back within seconds.
4. Then undo the bad change in the code, so the next push doesn't bring it back:

```bash
git revert <commit-id>
```

Get the commit id from `git log --oneline`, then run `npm test` and
`git push origin master`.

Students who installed the app get the fixed version the next time they open
it with internet.

## Running it on your computer

```bash
npm install
npm run dev
```

The site opens at http://localhost:5173 and the API runs on 8787. Local
settings go in `.env`: copy `.env.example`, which explains every setting.
`.env` is never committed. Without keys, sign-in codes print in the terminal
and AI generation needs `BEDROCK_API_KEY`.

## Settings on the live site

These are set in Vercel → studypack-generator → **Settings → Environment
Variables** (values are hidden there; never paste them anywhere public):

| Setting | What it does | Where it comes from |
|---|---|---|
| `BEDROCK_API_KEY`, `BEDROCK_REGION` | Lets the server call Claude | AWS console → Bedrock → API keys |
| `STUDY_GUIDE_MODEL`, `STUDY_GUIDE_EFFORT` | Which Claude model writes paid packs, and how hard it thinks | Your choice (see `.env.example`) |
| `VITE_ENABLE_AI_GENERATION` | Turns the Generate button on (`true`) | — |
| `VITE_GOOGLE_CLIENT_ID` | Google sign-in | Google Cloud → Credentials |
| `SESSION_SECRET` | Signs the sign-in cookie. **Changing it signs everyone out.** | Any long random string |
| `EMAIL_FROM`, `BREVO_API_KEY` | Sign-in code emails | Brevo |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` (and the other `KV_`/`REDIS_URL`) | The Upstash database | Added by Vercel's Upstash integration; don't edit |
| `PAYSTACK_SECRET_KEY` | Naira payments (`sk_live_…` takes real money, `sk_test_…` doesn't) | Paystack → Settings → API Keys & Webhooks |
| `GUMROAD_PRO_PRODUCT_ID`, `GUMROAD_PRO_URL` | Dollar payments for Pro | Gumroad product settings |
| `SUPADATA_API_KEY` | YouTube links | Supadata |
| `ADMIN_EMAILS` | Who sees Referral stats and can publish Verified packs | Your Google account email(s), comma-separated |
| `IP_HASH_SALT` | Scrambles IP addresses for the sign-in limits | Any random string |
| `GUIDES_PER_DAY_TOTAL` | Most Free packs per day across the whole site (budget safety) | Your choice (default 20) |
| `MAX_INPUT_CHARS` | An older limit on note length; plans now set their own | — |

Paystack's webhook must point to
`https://studypack-generator.vercel.app/api/paystack-webhook` (Paystack →
Settings → API Keys & Webhooks), or card renewals and cancellations won't
reach StudyPack.

## Changing prices, limits and the exchange rate

Everything is a setting, so no code changes are needed. Add or change it in
Vercel's Environment Variables, then redeploy. Current values (the defaults
in `server/plans.js`):

| Plan | Price (`*_PRICE_NGN`) | Per 3 hours (`*_WINDOW_NGN`) | Per 30 days (`*_MONTH_NGN`) | Packs written by |
|---|---|---|---|---|
| Free | ₦0 | ₦900 (`FREE_WINDOW_NGN`) | ₦900 (`FREE_MONTH_NGN`) | Haiku (fast, cheap) |
| Plus | ₦2,500 (`PLUS_PRICE_NGN`) | ₦700 | ₦1,750 | Haiku |
| Pro | ₦5,000 (`PRO_PRICE_NGN`) | ₦1,500 | ₦3,500 | `STUDY_GUIDE_MODEL` |
| Max | ₦12,000 (`MAX_PRICE_NGN`) | ₦3,000 | ₦8,500 | `STUDY_GUIDE_MODEL` |

- **Allowances are naira of real AI cost.** Each pack uses up what Claude
  actually cost. Keep each plan's 30-day allowance at about 70% of its price,
  so about 30% is left after AI costs.
- **`USD_TO_NGN`** (default 1600) converts Claude's dollar bill to naira. Keep
  it a bit above the market rate. If the naira weakens past it, raise it, or
  heavy users can cost more than they pay.
- **Changing a price:** students on card auto-renew at the old price are told,
  and their auto-renew stops at the next renewal so they're never charged a
  price they didn't agree to. They can subscribe again at the new price.
- Feature switches (which plans get theory questions, scans, diagram pages,
  pasted text, YouTube limits, Pack library limits) are listed with their
  defaults in `.env.example`.

## What it costs to run

| Service | What drives the bill | Watch |
|---|---|---|
| AWS Bedrock (Claude) | Every pack, answer and scan. Roughly ₦140 for a Free/Plus pack on Haiku, ₦300–1,000 on paid plans' model | AWS console → Billing. Set a **budget alert** there (Billing → Budgets) |
| Vercel | Hosting. The **Hobby (free) plan is for non-commercial use** under Vercel's terms; StudyPack takes payments, so move to **Pro ($20/month)** once revenue allows | Vercel → Usage |
| Upstash | Database requests; the free tier covers a small site | Upstash → Usage |
| Brevo | Sign-in emails: 300/day free (`EMAIL_CODES_PER_DAY` stops at 250) | Brevo dashboard |
| Supadata | YouTube imports: 100 credits/month free (`YOUTUBE_MONTHLY_CAP` stops at 90) | Supadata dashboard; raise the cap if you upgrade |
| Paystack | Per payment: about 1.5% + ₦100 on local cards (the ₦100 is waived under ₦2,500) | Paystack → Transactions |

## Checking how it's doing

- **Visitors:** Vercel → studypack-generator → **Analytics**. This shows
  visits per screen (`/`, `/plans`, `/flashcards`…), where visitors came from
  (X shows as `t.co`), countries and devices.
- **Share links and invites:** in the app, signed in with an `ADMIN_EMAILS`
  account: account menu → **Referral stats**. It shows visits, sign-ups,
  payments and revenue per link. Make links like
  `https://studypack-generator.vercel.app/?ref=twitter` or `?ref=ada` (one per
  campaign or campus ambassador).
- **Payments:** Paystack → Transactions.
- **Errors:** Vercel → studypack-generator → **Logs**. Lines start with what
  they're about: `[billing]`, `[auth]`, `[study-guide]`, `[ask]`… Filter by
  them, or by **Error**.

## Everyday tasks

### Refunds (the terms promise: within 7 days, if no paid features were used)

1. Find the payment in Paystack → Transactions (search by the student's email
   or the reference they send). Check it's under 7 days old.
2. **Refund** it in Paystack.
3. Optionally, end their plan early: Upstash data browser → delete the key
   `studypack:sub:<account id>`. To find the account id, look up
   `studypack:email:<their email>` or `studypack:login:<their email>`.
   Without this, the plan simply runs to its end date.

### Deleting a student's data (the privacy policy promises within 30 days)

In the Upstash data browser, find their account id from
`studypack:login:<email>` (or `studypack:email:<email>`), then delete:

- `studypack:login:<email>` and `studypack:email:<email>`
- `studypack:lib:<id>` and every `studypack:pack:<id>:*` (their synced library)
- `studypack:sub:<id>`, `studypack:autorenew:<id>` (plan)
- every `studypack:use:<id>:*` (usage counters)
- every `studypack:account:<id>:*` (sign-up, invite and payment flags)
- every `studypack:invites:<id>:*`

Keep the Paystack and Gumroad payment records: tax law needs them. Reply to
the student when it's done. Packs they shared to the Pack library don't name
them; remove one in the app if they ask.

### Reviews and the Discord community

- **Reviews:** after a quiz, signed-in students are asked to rate StudyPack
  (1–5 stars, optional comment). Read them in the app: account menu →
  **Referral stats & reviews** (admins only). "OK to show publicly" means the
  student allowed their first name and comment on the website; never show
  one without it. To delete a review, remove the student's account id from the
  Upstash hash `studypack:reviews`.
- **Discord link:** set `VITE_DISCORD_URL` in Vercel (an invite that never
  expires), then redeploy. Without it the Discord links are hidden.

### Adding ready-made packs to the Pack library

Sign in with an `ADMIN_EMAILS` account, generate the pack from the lecture
notes (or a course outline), and use the **Share** icon on it in your
**Library**. Admin shares appear as **Verified**. A student can remove a pack
they shared; an admin can remove any pack. The JSON files in `study-packs/`
on this computer are copies of the 18 first-year course packs already
published.

### A key leaked, or you want to change one

Make a new key at the provider (AWS, Paystack, Brevo…) and delete the old
one. Put the new value in Vercel's Environment Variables, then redeploy.
Changing `SESSION_SECRET` signs everyone out (harmless; they sign in again).

### The Android app (Google Play)

The Play Store app (`com.studypack.app`) opens the live site full-screen, so
website changes reach it without an app update. Its files are in
`C:/Users/Administrator/Desktop/studypack-android` (back that folder up
privately; never commit it). It contains:

- `PLAY-STORE-STEPS.md`: publishing step by step
- `store-listing/`: the listing text and images
- `package/signing.keystore`: the signing key every future update needs, with
  its passwords in `SIGNING-PASSWORDS.txt`

`public/.well-known/assetlinks.json` tells Android the app and site belong
together. If the app shows an address bar at the top, that file is wrong or
missing Google Play's app-signing fingerprint (Play Console → App integrity).

## Common problems

| What you see | Likely cause | What to do |
|---|---|---|
| Site blank or broken right after a deploy | A bad change | Roll back (above) |
| "Generate" fails for everyone | Bedrock key expired, AWS bill unpaid, or model not available | Logs (`[study-guide]`); AWS console → Bedrock → check the key and model access; replace the key if needed |
| Generation very slow sometimes | Bedrock is slow to start | Nothing; it retries on its own. If constant, check AWS service health |
| "StudyPack has reached today’s limit for free study packs" | `GUIDES_PER_DAY_TOTAL` reached (paid plans aren't affected) | Raise it if your AWS budget allows |
| Sign-in codes not arriving | Brevo daily limit, or sender not verified | Brevo dashboard; students can use Google meanwhile |
| Google sign-in error or warning | Site address missing from the OAuth client, or consent screen not published | Google Cloud → Credentials (Authorized JavaScript origins) and OAuth consent screen (add the privacy and terms links, publish) |
| Student paid but still on Free | They didn't return from Paystack and the webhook didn't arrive | Check the webhook URL in Paystack; ask them to open the Plans page; search Logs for their reference |
| Auto-renew not cancelling | Webhook not reaching the site | Same webhook check |
| YouTube links stopped working | Supadata credits used up, or `YOUTUBE_MONTHLY_CAP` reached | Supadata dashboard; it resets monthly, or upgrade and raise the cap |
| "Plans coming soon" instead of prices | `PAYSTACK_SECRET_KEY` missing | Add it and redeploy |
