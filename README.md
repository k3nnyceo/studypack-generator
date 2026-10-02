# StudyPack

Upload lecture notes (PDF or PowerPoint `.pptx`) and turn them into an interactive study guide with flashcards and a quiz.

Built with React 19, Vite and Tailwind CSS v4. An optional Node API server can generate study guides with Claude; it is off by default.

**Design system:** "Grape & Sand": a grape-violet brand scale (`brand-*`) with warm `stone` neutrals and an amber accent, defined as Tailwind tokens in `src/index.css`. Green and rose are reserved for correct/incorrect answers. Type is Plus Jakarta Sans (bundled via Fontsource, no external requests) and icons are Lucide.

## Getting started

```bash
npm install
npm run dev            # Vite on :5173 (+ the API server on :8787)
```

No API key is needed in the default setup.

For production: `npm run build && npm start`. The API server also serves the built frontend from `dist/`, on `PORT` (default 8787).

Other scripts: `npm run dev:web` / `npm run dev:api` (run one half), `npm run lint`.

## How it works

1. **Parse (browser).** The PDF/PPTX is read in the browser and never uploaded. The extracted text is shown by page/slide or as full text, with a **Copy all text** button.
2. **Get a study guide.** With AI generation on, click **Generate study pack**. Otherwise (or as well), paste or upload study guide JSON; **Copy AI prompt + notes** copies a ready-made prompt to paste into any AI chat tool.
3. **Study.** The guide populates three tabs: **Study guide**, **Flashcards** and **Quiz**.

## Study pack library

Every study pack you load (pasted or uploaded in the Load box, dropped on the home page as `.json`, or generated) is saved to a library in the browser's `localStorage` (key `studypack.library.v1`). Signed out, the library lives on that device and browser. Signed in with Google, it also syncs to the account, so it's the same on every device (see [Google sign-in and library sync](#google-sign-in-and-library-sync)).

- **Library** in the top bar lists every pack, grouped by `course` when there's more than one course. Packs without a course go under "Uncategorized", and `topic` defaults to the title.
- Click a pack to open it in the Study guide, Flashcards and Quiz tabs. The home page also shows your three most recent packs.
- The bin icon deletes a pack; the confirmation toast has **Undo**.
- Loading a pack that's already saved (identical content) opens it without saving a duplicate. A different pack with the same title is saved as its own entry.
- Stored packs are re-validated on load, so a corrupted entry is skipped rather than breaking the app. If storage is full or blocked, the pack still opens and a message explains it wasn't saved.

## Study guide JSON format

Click **Show expected format** in the app for the same reference with a copyable example. The source of truth is `src/lib/studyGuideFormat.js`.

```json
{
  "title": "Introduction to Cell Biology",
  "course": "BIOL 1010 Cell Biology",
  "topic": "Cell structure and energy",
  "overview": "2-4 sentences on what the material covers.",
  "modules": [
    {
      "title": "Mitochondria & Cellular Respiration",
      "sourceRange": "Slides 7-12",
      "summary": "Paragraphs separated by a blank line (\n\n).",
      "keyPoints": ["ATP is the cell's energy currency"],
      "definitions": [{ "term": "ATP", "definition": "Adenosine triphosphate: ..." }],
      "workedExamples": [
        { "title": "ATP yield", "problem": "...", "steps": ["...", "..."], "answer": "About 120 ATP." }
      ],
      "quiz": [
        {
          "question": "Where does most ATP production happen?",
          "options": ["Nucleus", "Mitochondria", "Ribosome", "Golgi apparatus"],
          "correctIndex": 1,
          "explanation": "The electron transport chain in the mitochondria produces most ATP."
        }
      ]
    }
  ]
}
```

| Field | Rules |
| ----- | ----- |
| `title`, `overview` | Required strings |
| `course`, `topic` | Optional strings. Used to group and label the pack in your library |
| `modules` | Required, at least one |
| `modules[].title`, `.summary` | Required strings |
| `modules[].sourceRange` | Optional string |
| `modules[].keyPoints`, `.definitions`, `.workedExamples` | Required arrays, may be `[]`. Aim for 3-5 worked examples |
| `modules[].quiz` | Optional. If missing or `[]`, questions are generated from the module's definitions |
| `quiz[].options` | At least 2 strings. Shown in random order so the answer isn't always the same letter; questions with a positional option ("All of the above", "Both A and B") keep their order |
| `quiz[].correctIndex` | Integer position of the right option, counting from 0 |
| `quiz[].explanation` | Optional string |

Extra fields are ignored and a surrounding ` ```json ` code fence is accepted. Invalid input lists every problem by path, e.g. `modules[2].definitions[0].term is missing`.

**Quiz:** answers are marked right or wrong instantly with an explanation, and a results screen shows the score, a per-module breakdown and every missed question. "Retry incorrect only" starts a round with just the missed questions.

**Quiz fallback:** for a module without `quiz`, each definition becomes a "Which term matches this definition?" question. The distractors are other terms (from the same module first), and these questions are marked "From definitions". After answering, each wrong option is shown with its own definition.

## Google sign-in and library sync

With `VITE_GOOGLE_CLIENT_ID` set, students can sign in with Google (the button in the top bar, on the Generate card, or in the Library). **Generating with AI requires it**; the sample pack and JSON paste work without an account.

- **Sign-in** (`server/auth.js`, `src/lib/auth.js`): Google's button (Google Identity Services) returns an ID token; `POST /api/auth` checks it against Google's public keys and your client id, then sets `sp_session`, an HttpOnly, `SameSite=Lax`, 30-day cookie holding a JWT signed with `SESSION_SECRET` (Google account id, name, email, picture). There's no session store. `GET /api/auth` returns the current user; `DELETE` signs out. On Chrome, including Android, the button uses FedCM, a native account sheet over the page, so uploaded notes aren't lost.
- **Generation** needs a session: usage is metered **per Google account** (see [Plans, usage and payments](#plans-usage-and-payments)), and a job can only be polled or cancelled by the account that started it.
- **Library sync** (`server/library.js`, `src/lib/librarySync.js`): `/api/library` stores each account's packs in Upstash, as a hash of summaries (`studypack:lib:<account>`) plus one key per guide (`studypack:pack:<account>:<id>`), up to 300 packs of up to 800 KB each. A sync lists the summaries, uploads packs this device has that the account doesn't, downloads only the packs it's missing, drops packs deleted on another device, and merges the same pack loaded on two devices into one. It runs on sign-in and when the app returns to the foreground (at most once a minute); new packs upload as they're saved, and deletes made offline are retried. Signing out removes the account's packs from that device; packs made while signed out stay and upload on the next sign-in.

## Plans, usage and payments

Three plans, with usage counted the way Claude's own app does it: each study pack uses part of an allowance according to what it really cost (Claude's token bill, converted to naira at `USD_TO_NGN`), so a long lecture uses more than a short one.

| | Free | Pro | Max |
|---|---|---|---|
| Price | ₦0 | ₦3,500 / month | ₦6,500 / month |
| Every 3 hours | ₦400 of cost (~1 pack) | ₦1,000 (~2 packs) | ₦2,000 (~5 packs) |
| Each month / 30-day period | ₦1,000 (~2 packs) | ₦2,300 (~6 packs) | ₦4,600 (~13 packs) |
| Longest notes | 13K characters (~26 pages) | 39K (~78 pages) | 40K (~80 pages) |
| Site-wide daily cap | applies | skipped | skipped |

All of these are environment variables (`.env.example`). The pack counts are for a typical 23-page, 11K-character lecture, which costs about ₦340; long lectures cost more (about ₦700 for 27K characters and ₦1,000 for 40K, each finishing in about 2½ minutes), so they use more of the allowance. Because usage is charged at real cost, the worst case (a subscriber using everything) stays at roughly ₦1,000 profit on Pro and ₦1,700 on Max after Paystack's fee.

- **Meter** (`server/usageLimits.js`, `server/plans.js`): per account, a counter for the current 3-hour window (fixed windows from 00:00 UTC, so the refill time is predictable) and one for the period (the calendar month in Lagos time on Free; the paid 30-day period on Pro and Max). Before generating, the pack's cost is estimated from the notes' length and reserved; if it doesn't fit, the student sees which allowance ran out and when it refills. When the pack is done its real cost replaces the estimate; if it fails or is cancelled, nothing is charged. Students only ever see percentages, never naira of cost.
- **Paying** (`server/billing.js`, `server/paystack.js`, `server/subscriptions.js`): the plans page offers each paid plan as **30 days for a one-time payment** (card, bank transfer or USSD) or **renew monthly by card** (a Paystack plan, created automatically the first time). Checkout is Paystack's hosted page; the student comes back to `/?billing=return&reference=…` and the app verifies the transaction with Paystack before applying it. Paystack's webhook (`/api/paystack-webhook`, signature-checked) applies card renewals and records when auto-renew is turned off. Each payment reference is applied once. Paying again on the same plan adds 30 days to any left; switching plan converts the unused days by price. Switching away from an auto-renewing plan cancels its Paystack subscription. "Manage auto-renew" opens Paystack's page for cancelling or changing the card.

## Share links and referral stats

Links like `/?ref=tiktok`, `/?ref=whatsapp-eee` or `/?ref=ada` (an ambassador) show which channels bring paying students. `utm_source` works too, for ad platforms that add it.

- **Attribution is first-touch** (`src/lib/referral.js`, `server/referrals.js`): the first link a browser arrives through is remembered for 30 days and removed from the address bar; each browser counts once as a visit per link. It's sent with the student's first sign-in and kept on the account, so their later payments are credited to it. Students without a link count as "direct". Accounts that existed before this feature count as new sign-ups the next time they sign in.
- **Referral stats** (account menu, only for `ADMIN_EMAILS`): visits, sign-ups, paying students, payments and revenue per link, and a builder for new links. Counters live in Upstash.

## AI generation

With AI generation on, "Generate study pack" turns uploaded notes into a full study pack with Claude. It's behind a flag and **off by default**; while off, the Generate UI and API call are compiled out of the bundle and `/api/study-guide` returns `503` without contacting Claude.

### Going live on Vercel

1. **Claude access**, either:
   - **Amazon Bedrock** (current setup): a long-term Bedrock API key in `BEDROCK_API_KEY`, plus `BEDROCK_REGION` (default `us-east-1`). Set an **AWS Budget** alert as a backstop. Or:
   - **Claude API**: `ANTHROPIC_API_KEY` from platform.claude.com, with a **monthly spend limit** in the Console.
2. **Upstash:** in the Vercel project, **Storage → Upstash for Redis** (free tier). This adds `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`, which the server needs for usage, plans and jobs. Without them, generation is refused rather than unlimited.
3. **Google sign-in:** create an OAuth client and set `VITE_GOOGLE_CLIENT_ID` and `SESSION_SECRET` (see `.env.example`). Generation requires sign-in.
4. **Environment variables** (Project → Settings → Environment Variables): `VITE_ENABLE_AI_GENERATION=true`, the Claude credentials from step 1, `PAYSTACK_SECRET_KEY` for paid plans, and optionally the plan and usage settings, `STUDY_GUIDE_MODEL` and `STUDY_GUIDE_EFFORT` (see `.env.example`).
5. **Redeploy**, since the frontend reads the flag and client id at build time.

### How it works

- `api/study-guide.js` is a Vercel Function (`maxDuration: 300`, the Hobby maximum). It and the local dev server (`server/index.js`) share `server/studyGuideHandler.js`.
- **Usage** is metered per account against its plan (see [Plans, usage and payments](#plans-usage-and-payments)), stored in Upstash; local dev without Upstash uses an in-memory store.
- **Two-stage, parallel generation:** one call plans the guide (title, course, topic, overview, and each module's title, page range and focus) at low effort; then one call per module writes it, in parallel, and the results are assembled and validated. Module 1 starts first and writes the notes to the prompt cache; the other modules start as soon as it begins replying and read the notes from the cache. On a 23-page lecture this took 85s for $0.22 (Sonnet 4.6, medium effort) versus 160s for $0.15 as a single call; total time is roughly the plan plus the slowest module, so it grows much more slowly with lecture length.
- **Background jobs** (`server/jobs.js`): `POST /api/study-guide` checks the session, reserves a slot, starts a job and answers `202 { jobId, remaining }` at once; the work continues after the response (`waitUntil`) and the result is stored in Upstash for an hour. The browser polls `GET /api/study-guide?job=<id>` every 3s, and immediately when the tab becomes visible again, so a phone can lock its screen or switch apps mid-generation. The job id is kept in `localStorage`, so if the page reloads, the home page shows "Finishing your study pack…" and opens it when ready. Cancel sends `DELETE ?job=<id>`; the job notices within 5s, aborts the Claude calls and releases the slot.
- **Claude call** (`server/studyGuide.js`): through **Amazon Bedrock** when `BEDROCK_API_KEY` is set (default model `global.anthropic.claude-opus-4-6-v1`, Bedrock's InvokeModel endpoint), otherwise the **Claude API** (`claude-opus-5`, with server-side refusal fallbacks). Both use adaptive thinking, a JSON schema matching the format above (`quiz`, `course` and `topic` always included), and the same validator as pasted JSON. Override the model with `STUDY_GUIDE_MODEL`. Notes longer than the plan allows are rejected rather than truncated.
- **Cost logging:** every generation logs one line, e.g. `[study-guide] model=claude-opus-5 effort=high chars=… in=… out=… cost≈$… time=…`, in Vercel → Logs, to measure the real cost per guide.
- The API key is read only from the server's environment; it never reaches the browser. The UI tells visitors that their notes' text is sent to Claude.

## Project structure

```
api/
  study-guide.js              Vercel Function for /api/study-guide (start / poll / cancel a job)
  auth.js                     Vercel Function for /api/auth (Google sign-in, session, sign out)
  library.js                  Vercel Function for /api/library (synced library)
  billing.js                  Vercel Function for /api/billing (plans, usage, checkout)
  paystack-webhook.js         Vercel Function for Paystack's events
  referrals.js                Vercel Function for /api/referrals (visits, admin stats)
server/
  auth.js                     Google ID token check, signed session cookie
  library.js                  synced library storage and API (Upstash / in-memory)
  http.js                     sendJson, body parsing
  index.js                    local API server (+ static hosting of dist/ when self-hosting)
  studyGuideHandler.js        shared request handling: flag, validation, limits, jobs
  jobs.js                     generation job store (Upstash / in-memory)
  studyGuide.js               Claude call, prompt, JSON schema, cost logging
  usageLimits.js              usage meter and key-value store (Upstash / in-memory)
  plans.js                    plans, allowances, cost estimate
  billing.js                  /api/billing and the Paystack webhook
  paystack.js                 Paystack API client, webhook signatures
  subscriptions.js            paid periods, applying payments once
  referrals.js                share-link visits, sign-ups and payments
src/
  App.jsx                     views (home / notes / guide / flashcards / quiz) and state
  config.js                   feature flags (VITE_ENABLE_AI_GENERATION, VITE_GOOGLE_CLIENT_ID)
  index.css                   design tokens: palette, font, shadows, animations
  components/
    AppHeader.jsx             sticky top nav with the study-view tabs
    AccountMenu.jsx           sign-in button / avatar with Sign out
    GoogleButton.jsx          Google's "Sign in with Google" button
    Landing.jsx               home page
    UploadDropzone.jsx        drag-and-drop / click-to-browse input
    ExtractedPreview.jsx      Notes view: extracted text (by page/slide or full text)
    GuideImport.jsx           JSON paste box, Load, format reference
    AiGenerate.jsx            "Generate with Claude" panel (flag-gated)
    GuideHero.jsx             course header above the study views
    StudyGuide.jsx            modules, key points, definitions, worked examples
    Flashcards.jsx            flip cards, shuffle, filters, progress
    Quiz.jsx                  multiple-choice quiz with scoring
    ui.jsx, buttonStyles.js   shared Button, Badge, Logo, Eyebrow
    Library.jsx               saved study packs, grouped by course
    Plans.jsx, UsageBars.jsx  plans & usage page, usage bars
    ReferralStats.jsx         admin: stats per share link, link builder
    Toast.jsx                 short confirmations with optional Undo
    FilterChip.jsx, CopyButton.jsx
  lib/
    parseDocument.js          validation, dispatch, normalisation
    parsePdf.js               PDF text extraction
    parsePptx.js              PPTX text extraction
    studyGuideFormat.js       JSON format: example, validator, AI prompt
    library.js, useLibrary.js study pack library in localStorage, synced when signed in
    librarySync.js            sync with the account (/api/library)
    auth.js                   useAuth, Google Identity Services loader
    billing.js                useBilling, checkout, return from Paystack
    referral.js               captures ?ref= links, first-touch
    flashcards.js             builds flashcards from a guide
    quiz.js                   builds quiz questions (+ definition fallback)
    generateStudyGuide.js     starts a generation job and polls it; resumes after a reload (flag-gated)
```
