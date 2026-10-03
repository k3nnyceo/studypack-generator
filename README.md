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
| Price | ₦0 | ₦3,500 / month | ₦10,500 / month |
| Every 3 hours | ₦400 of cost (~1 pack) | ₦1,000 (~1 pack with theory) | ₦2,800 (~5 packs) |
| Each month / 30-day period | ₦1,000 (~2 packs) | ₦2,300 (~4 packs) | ₦7,000 (~12 packs) |
| Longest notes | 13K characters (~26 pages) | 40K (~80 pages) | 40K (~80 pages) |
| Site-wide daily cap | applies | skipped | skipped |
| Theory questions | no | yes | yes |
| Scanned & photographed notes, pasted text | no | no | yes |

All of these are environment variables (`.env.example`). The pack counts are for a typical 23-page, 11K-character lecture, which costs about ₦340; long lectures cost more (about ₦700 for 27K characters and ₦1,000 for 40K, each finishing in about 2½ minutes), so they use more of the allowance. Because usage is charged at real cost, the worst case (a subscriber using everything) stays at roughly ₦1,000 profit on Pro and ₦3,200 on Max after Paystack's fee.

- **Meter** (`server/usageLimits.js`, `server/plans.js`): per account, a counter for the current 3-hour window (fixed windows from 00:00 UTC, so the refill time is predictable) and one for the period (the calendar month in Lagos time on Free; the paid 30-day period on Pro and Max). Before generating, the pack's cost is estimated from the notes' length and reserved; if it doesn't fit, the student sees which allowance ran out and when it refills. When the pack is done its real cost replaces the estimate; if it fails or is cancelled, nothing is charged. Students only ever see percentages, never naira of cost.
- **Paying** (`server/billing.js`, `server/paystack.js`, `server/subscriptions.js`): the plans page offers each paid plan as **30 days for a one-time payment** (card, bank transfer or USSD) or **renew monthly by card** (a Paystack plan, created automatically the first time). Checkout is Paystack's hosted page; the student comes back to `/?billing=return&reference=…` and the app verifies the transaction with Paystack before applying it. Paystack's webhook (`/api/paystack-webhook`, signature-checked) applies card renewals and records when auto-renew is turned off. Each payment reference is applied once. Paying again on the same plan adds 30 days to any left; switching plan converts the unused days by price. Switching away from an auto-renewing plan cancels its Paystack subscription. "Manage auto-renew" opens Paystack's page for cancelling or changing the card.

## Exam mode, theory questions, scanned notes

- **Exam mode** (`src/components/ExamMode.jsx`, every plan): from the Quiz, a timed mock exam of 10, 20 or 30 of the pack's questions at 45 s, 1 min or 1½ min each. No feedback until it's submitted; answers can be changed and questions flagged; it submits itself when time runs out (the clock runs from a fixed end time, so a locked phone doesn't pause it). Results give a percentage and a grade on the Nigerian A–F scale, a per-module breakdown and a review of every answer.
- **Theory questions** (`src/components/Theory.jsx`, Pro and Max, `THEORY_PLANS`): each module gets 2 exam-style written questions ("Explain…", "Calculate…") with marks, a model answer and the examiner's marking points. In the **Theory** tab students can draft an answer, reveal the model answer and tick the points they covered for a self-marked score. Theory adds a roughly fixed cost per module (a 23-page lecture: about $0.22 → $0.35), so cost estimates use separate formulas with and without it (`server/plans.js`). The field is optional in the JSON format; older packs have no Theory tab.
- **Scanned and photographed notes** (`src/lib/scanPages.js`, `server/transcribe.js`, Max, `SCAN_PLANS`): a PDF where most pages have no text, or photos of pages (JPG/PNG/WEBP, several at once), is offered for reading instead of being rejected. The browser renders each page to a ~1600 px JPEG and sends 5 at a time to `/api/transcribe`, where Claude Haiku 4.5 transcribes them (handwriting, tables and equations as text, diagrams described in brackets). Measured: 40 handwritten pages in 95 s for about $0.09, charged to the usage allowance at real cost. The first 40 pages of a file are read. Files up to 100 MB are accepted (scans are large; they stay on the device).
- **Pasted text** (Max, `PASTE_PLANS`): "Paste text" on the home page turns pasted notes into the Notes screen.
- **Reliability:** each Claude call has a stall watchdog. A call that sends nothing for 45 s, or whose stream breaks, is retried once if there's time before Vercel's 300 s limit, and every call's duration is logged (`[study-guide] module 3 55.2s`).

## Flashcard memory, streaks and offline use

- **Flashcards that remember** (`src/lib/cardMemory.js`): after flipping a card, **Still learning** or **Got it**. Got it moves the card up a box and schedules its next review 1, 3, 7, 16, then 35 days later; Still learning sends it back to the start. The deck opens with missed cards, then cards due for review, then new ones, then learned ones (soonest first), and each card shows its status. Kept per pack (by content) in this browser's `localStorage` (`studypack.cards.v1`); not synced between devices.
- **Daily streak** (`src/lib/streak.js`): consecutive days (Lagos time) with any studying (marking a flashcard, answering a quiz question, finishing an exam, checking a theory answer), shown on the flashcards and in the Library.
- **Offline** (`public/sw.js`): the service worker saves the app (the home page and every script and stylesheet it loads) when it installs, serves pages network-first with the saved copy as a fallback, and hashed `/assets/` files cache-first. Saved packs live in `localStorage`, so studying works with no connection; a notice says so. The API is never cached. Bump `APP_CACHE` in `sw.js` to clear old saved files.

## Pack library

Ready-made packs any student can add to their own library (`server/shared.js`, `src/components/PackLibrary.jsx`), reached from the home page ("Browse ready-made packs") and the Library.

- **Who adds packs:** admins (`ADMIN_EMAILS`) share packs from their library as **Verified**; signed-in students can share packs from theirs (the Share icon on a pack, with a confirmation). Shared packs never show who shared them. The same pack is only listed once (by content). Whoever shared a pack, or an admin, can remove it. Students can share up to 20 a day.
- **Adding** a pack copies it into the student's library (and so to all their devices) and opens it. It uses one of the day's adds: Free 5, Pro 15, Max 40 (`*_LIBRARY_PER_DAY`), resetting at midnight Lagos time; adding the same pack again that day is free, and a pack already in the student's library just opens. Library packs cost no Claude usage, so this is separate from the generation allowance.
- **Browsing** is public, so the library also works as a showcase for visitors who haven't signed in.

## Gumroad

For students paying in dollars from outside Nigeria (`server/gumroad.js`): create one Gumroad product per plan ("30 days of StudyPack Pro"/"Max") with **license keys** turned on, and set `GUMROAD_PRO_PRODUCT_ID`/`GUMROAD_PRO_URL` (and the `MAX` pair). The plans page then links to the products and has a **Redeem key** box. A key is checked with Gumroad's license API (product id + key, no secret needed), grants 30 days of its plan like a Paystack payment, and works for one StudyPack account only; refunded, disputed and test purchases are refused (`GUMROAD_ALLOW_TEST=true` to try it out). Gumroad sales count in the referral stats at `USD_TO_NGN`.

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
  shared.js                   Vercel Function for /api/shared (Pack library)
  transcribe.js               Vercel Function for /api/transcribe (scanned pages, Max)
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
  shared.js                   Pack library: browse, add (daily allowance), share, remove
  gumroad.js                  Gumroad license keys for Pro and Max
  transcribe.js               reads scanned/photographed pages with Claude Haiku
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
    PackLibrary.jsx           the Pack library page
    ExamMode.jsx              timed mock exam (from the Quiz)
    Theory.jsx                theory questions with model answers
    ScanPanel.jsx             scanned notes and pasted text panels
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
    cardMemory.js, streak.js  flashcard review schedule; daily study streak
    useOnline.js              online/offline state for the offline notice
    shared.js                 Pack library API client
    scanPages.js              renders scanned pages/photos and reads them
    flashcards.js             builds flashcards from a guide
    quiz.js                   builds quiz questions (+ definition fallback)
    generateStudyGuide.js     starts a generation job and polls it; resumes after a reload (flag-gated)
```
