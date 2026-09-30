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
2. **Load a study guide.** Paste study guide JSON into the text box and click **Load**. **Copy AI prompt + notes** copies a ready-made prompt (format + rules + your notes) to paste into any AI chat tool.
3. **Study.** The guide populates three tabs: **Study guide**, **Flashcards** and **Quiz**.

## Study guide JSON format

Click **Show expected format** in the app for the same reference with a copyable example. The source of truth is `src/lib/studyGuideFormat.js`.

```json
{
  "title": "Introduction to Cell Biology",
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

## AI generation (optional, off by default)

The Claude integration is kept but disabled behind a feature flag. To turn it on:

```bash
cp .env.example .env
# in .env:
VITE_ENABLE_AI_GENERATION=true
ANTHROPIC_API_KEY=sk-ant-...
```

Then restart `npm run dev` (and rebuild for production). With the flag on:

- A **Generate with Claude** panel appears under the JSON box. While the flag is off, that UI and the API call are compiled out of the bundle entirely.
- `POST /api/study-guide` calls Claude (`claude-opus-5`). While the flag is off, it returns `503` without contacting Claude.
- Claude's response is constrained to a JSON schema matching the format above (with `quiz` always included), then run through the same validator as pasted JSON.
- Requests opt into server-side refusal fallbacks (`fallbacks: "default"`), so a declined request is retried on the recommended fallback model.
- Input over ~800K characters (~200K tokens) is rejected rather than truncated.
- The API key is read only from the environment on the server; it never reaches the browser.

## Project structure

```
server/
  index.js                    API server (+ static hosting of dist/ in production)
  studyGuide.js               Claude call, prompt and JSON schema (flag-gated)
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
    FilterChip.jsx, CopyButton.jsx
  lib/
    parseDocument.js          validation, dispatch, normalisation
    parsePdf.js               PDF text extraction
    parsePptx.js              PPTX text extraction
    studyGuideFormat.js       JSON format: example, validator, AI prompt
    flashcards.js             builds flashcards from a guide
    quiz.js                   builds quiz questions (+ definition fallback)
    generateStudyGuide.js     calls /api/study-guide (flag-gated)
```
