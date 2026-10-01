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

Every study pack you load (pasted or uploaded in the Load box, dropped on the home page as `.json`, or generated) is saved to a library in the browser's `localStorage` (key `studypack.library.v1`). There's no backend: the library lives on that device and browser.

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

## AI generation

With AI generation on, "Generate study pack" turns uploaded notes into a full study pack with Claude. It's behind a flag and **off by default**; while off, the Generate UI and API call are compiled out of the bundle and `/api/study-guide` returns `503` without contacting Claude.

### Going live on Vercel

1. **Claude access**, either:
   - **Amazon Bedrock** (current setup): a long-term Bedrock API key in `BEDROCK_API_KEY`, plus `BEDROCK_REGION` (default `us-east-1`). Set an **AWS Budget** alert as a backstop. Or:
   - **Claude API**: `ANTHROPIC_API_KEY` from platform.claude.com, with a **monthly spend limit** in the Console.
2. **Upstash:** in the Vercel project, **Storage → Upstash for Redis** (free tier). This adds `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`, which the server needs to enforce free-tier limits. Without them, generation is refused rather than unlimited.
3. **Environment variables** (Project → Settings → Environment Variables): `VITE_ENABLE_AI_GENERATION=true`, `ANTHROPIC_API_KEY`, `IP_HASH_SALT` (any random string), and optionally `FREE_GUIDES_PER_VISITOR_PER_DAY`, `GUIDES_PER_DAY_TOTAL`, `MAX_INPUT_CHARS`, `STUDY_GUIDE_MODEL`, `STUDY_GUIDE_EFFORT` (see `.env.example`).
4. **Redeploy**, since the frontend reads the flag at build time.

### How it works

- `api/study-guide.js` is a Vercel Function (`maxDuration: 300`, the Hobby maximum). It and the local dev server (`server/index.js`) share `server/studyGuideHandler.js`.
- **Limits** (`server/usageLimits.js`): a daily allowance per visitor (default 3) and a site-wide daily cap (default 20), stored in Upstash. Visitors are keyed by a salted hash of their IP, never the IP itself. A slot is reserved before calling Claude and released if generation fails or the visitor cancels, so errors don't use up allowances. Local dev without Upstash uses an in-memory store.
- **Two-stage, parallel generation:** one call plans the guide (title, course, topic, overview, and each module's title, page range and focus) at low effort; then one call per module writes it, in parallel, and the results are assembled and validated. Module 1 starts first and writes the notes to the prompt cache; the other modules start as soon as it begins replying and read the notes from the cache. On a 23-page lecture this took 85s for $0.22 (Sonnet 4.6, medium effort) versus 160s for $0.15 as a single call; total time is roughly the plan plus the slowest module, so it grows much more slowly with lecture length.
- **Long requests:** the response starts immediately and a space is written every few seconds while Claude works, so idle connections aren't dropped; the JSON follows (leading whitespace is valid JSON). If the visitor closes the page or clicks Cancel, the Claude request is aborted.
- **Claude call** (`server/studyGuide.js`): through **Amazon Bedrock** when `BEDROCK_API_KEY` is set (default model `global.anthropic.claude-opus-4-6-v1`, Bedrock's InvokeModel endpoint), otherwise the **Claude API** (`claude-opus-5`, with server-side refusal fallbacks). Both use adaptive thinking, a JSON schema matching the format above (`quiz`, `course` and `topic` always included), and the same validator as pasted JSON. Override the model with `STUDY_GUIDE_MODEL`. Notes longer than `MAX_INPUT_CHARS` (default 150K characters) are rejected rather than truncated.
- **Cost logging:** every generation logs one line, e.g. `[study-guide] model=claude-opus-5 effort=high chars=… in=… out=… cost≈$… time=…`, in Vercel → Logs, to measure the real cost per guide.
- The API key is read only from the server's environment; it never reaches the browser. The UI tells visitors that their notes' text is sent to Claude.

## Project structure

```
api/
  study-guide.js              Vercel Function for POST /api/study-guide
server/
  index.js                    local API server (+ static hosting of dist/ when self-hosting)
  studyGuideHandler.js        shared request handling: flag, validation, limits, keep-alive
  studyGuide.js               Claude call, prompt, JSON schema, cost logging
  usageLimits.js              free-tier limits (Upstash / in-memory)
src/
  App.jsx                     views (home / notes / guide / flashcards / quiz) and state
  config.js                   feature flags (VITE_ENABLE_AI_GENERATION)
  index.css                   design tokens: palette, font, shadows, animations
  components/
    AppHeader.jsx             sticky top nav with the study-view tabs
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
    Toast.jsx                 short confirmations with optional Undo
    FilterChip.jsx, CopyButton.jsx
  lib/
    parseDocument.js          validation, dispatch, normalisation
    parsePdf.js               PDF text extraction
    parsePptx.js              PPTX text extraction
    studyGuideFormat.js       JSON format: example, validator, AI prompt
    library.js, useLibrary.js study pack library in localStorage
    flashcards.js             builds flashcards from a guide
    quiz.js                   builds quiz questions (+ definition fallback)
    generateStudyGuide.js     calls /api/study-guide (flag-gated)
```
