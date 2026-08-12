# JSeeker

A desktop app for job seekers: keep one profile and resume in a single place, let a
local or hosted LLM answer questions about it, autofill application forms in the
browser, and lay out a resume in a small purpose-built language.

Electron + React 19 + TypeScript, bundled with Vite and styled with Tailwind v4.

## Features

- **Profile** — one flat key/value bag plus structured resume sections (experience,
  education, skills, languages). Seeded on first run by extracting text from
  uploaded PDFs.
- **Chat** — streaming conversation with your profile as context, backed by either a
  local Ollama model or the Claude API.
- **Builder** — a split-pane editor for `.resb` source with a live HTML preview.
- **Browser autofill** — a Chrome extension hands the whole application page to the
  model, which picks out the fields and answers with what to put in each one.

## Requirements

- Node 20+
- [Ollama](https://ollama.com) if you want to run models locally (optional — you can
  use the Claude API instead)

## Getting started

```bash
npm install
npm start          # build main + renderer, then launch Electron
```

For iterative work, run these in separate terminals:

```bash
npm run dev            # tsc --watch for the main/preload processes
npm run dev:renderer   # vite build --watch for the renderer
npm run dev:electron   # launch Electron against the built output
```

### Other scripts

| Script | Does |
| --- | --- |
| `npm run build` | Builds both the main process and the renderer |
| `npm run build:main` | `tsc` over `src/main` and `src/preload` → `dist/` |
| `npm run build:renderer` | Vite build → `dist/renderer/` |
| `npm run typecheck:renderer` | Typechecks the renderer without emitting |

The resume builder has its own config; typecheck it with
`npx tsc --noEmit -p src/resume_builder/tsconfig.json`.

## Project layout

```
src/
  main/          Electron main process
    main.ts            window creation, app lifecycle
    store.ts           JSON persistence in Electron's userData dir
    files.ts           file dialogs and reads
    extensionServer.ts local HTTP server the browser extension talks to
  preload/       contextBridge API exposed to the renderer as window.api
  renderer/      React UI
    components/        Profile, Chat, Builder, Settings views
    hooks/             store loading, chat, Ollama status
  agents/        LLM providers and prompts
    ollama.ts          local models, incl. first-run pull with progress
    claude.ts          Anthropic API
    resumeExtract.ts   PDF text extraction
  resume_builder/  the .resb language (see below)
extension/       Chrome MV3 autofill extension
```

## The resume builder

A small language for describing resume layout. The pipeline is
`tokenizer → parser → uiRenderer → compile`, ending in a standalone HTML document
that the Builder view shows in a sandboxed iframe.

A document has two sections. `macro:` defines named components and their styling;
`main:` supplies the content for each one.

```
macro:(
    Name: Cell(fw : 700, fs : 28, align : 'Center'),
    Contact: Block(
        Cell(fs : 12), Cell(fs : 12), Cell(fs : 12)
    )
)
main:(
    Name: 'Your Name',
    Contact: 'city, country' | 'you@example.com' | 'github.com/you'
)
```

A macro defined as a `Cell` takes one string. A `Block` takes one per child cell,
separated by `|`, distributed left to right.

### Keywords

`Cell` is a single region of text. `Block` is a horizontal band that lays its child
cells out in equal columns.

### Cell arguments

| Short | Long | Values |
| --- | --- | --- |
| `fw` | `fontWeight` | number |
| `fs` | `fontSize` | number (px) |
| `fst` | `fontStyle` | `Normal`, `Italic`, `SkewSmall`, `SkewMedium`, `SkewLarge` |
| `al` | `align` | `Top`, `Bottom`, `Left`, `Right`, `Center` |
| `pd` | `padding` | `Top`, `Bottom`, `Left`, `Right`, `All` |
| `ps` | `paddingSize` | number (steps of 4px) |
| `txt` | `text` | string |
| `cls` | `className` | string |

`Block` accepts `name`. Its children and column count come from the parsed source
and aren't settable directly.

### Syntax notes

- Strings use single or double quotes; numbers are integers.
- Comments are `//` to end of line, or `/* … */`.
- An argument name not in the table above is a compile error, so typos surface
  rather than being silently dropped.

### Debugging the parser

`src/resume_builder/runner.ts` parses `samples/sample-resume.resb` and prints the
AST:

```bash
cd src/resume_builder
npx tsx runner.ts
```

Set `parser.debugTokens = true` to also dump the token stream.

## LLM providers

Configured under **Settings → Assistant**.

- **Ollama** (default) — talks to `http://127.0.0.1:11434`, model `qwen2.5:3b`.
  Both are overridable in settings or via the `OLLAMA_HOST` / `OLLAMA_MODEL`
  environment variables. The app pulls the model on first run and reports progress
  in the footer.
- **Claude** — needs an API key in settings. The footer only checks that a key is
  present; it doesn't ping the API, since that would cost real usage.

## Browser extension

`extension/` is an unpacked Chrome MV3 extension. Load it via
`chrome://extensions` → Developer mode → **Load unpacked**.

Clicking its icon on an application page runs one round trip:

1. `content.js` walks the visible page and serializes it — the page's own text plus
   one line per fillable control, each tagged `jid="f<n>"` (backed by a
   `data-jseeker-id` attribute on the element). Scripts, styles and hidden subtrees
   are dropped, and the whole thing is capped at 48k characters.
2. `background.js` posts that snapshot to `POST http://127.0.0.1:8743/autofill`.
3. The app builds a prompt from the snapshot plus your profile and resume, and the
   configured model answers with `{id, value}` entries — the model is what finds the
   fields and decides what belongs in them; there's no rule-based matching anywhere.
4. `content.js` applies each entry against the element with that id, interpreting the
   value by the element's real type: text for inputs and textareas, an option match
   for `<select>`, and `"true"` to select a radio or tick a checkbox.

Applying only ever fills something in — an existing value is never overwritten, a
checked box is never unchecked, and nothing is ever submitted.

While that runs, the app isn't silent about it: the footer shows the fill in progress,
and the **Auto Tracker** tab lists every attempt — how many fields were on the page, how many
the model answered, and how many actually landed (the extension reports that last number
back via `POST /applied`). The list is in memory only, so it covers the current session
and isn't written to disk.

The request must present the bearer token from **Settings → Extension**. The token is
generated once and kept stable. It isn't protecting against filesystem access —
`store.json` is plaintext like everything else — just stopping other local processes
and web pages from triggering fills. Note that the profile itself never enters the
browser: the page goes to the app, and only the fill list comes back.

Two known limits: forms inside a cross-origin `<iframe>` (some Greenhouse and Workday
embeds) aren't reached, since only the top frame is injected; and a very long form can
hit the snapshot cap, in which case the tail of the page isn't seen.

### In-page chat

`Alt+J` — or right-click → **Ask JSeeker about this page** — drops a floating chat panel
into the current page ([widget.js](extension/widget.js)), styled inside a closed shadow
root so the host page's CSS and ours stay out of each other's way. It's the same
assistant as the app's Chat view, with the page's text added to the system prompt, so it
can answer about the posting in front of you. A checkbox turns that off, and the panel
has a **Fill form** button so you don't have to go back to the toolbar.

Both entry points grant `activeTab` for that page only — the extension holds no standing
permission to read the sites you visit. (Grammarly-style "always there on every page"
would mean `<all_urls>`, which is a much broader grant; this stays on-demand.)

Replies stream over `POST /chat` as server-sent events. The panel can't call
`127.0.0.1` itself — in MV3 a content script's cross-origin requests come from the
page's origin — so `background.js` makes the call and relays deltas over a
`chrome.runtime` port.

## Data and secrets

Profile data lives in `store.json` under Electron's `userData` directory, in
plaintext. `api.key`, `models/`, and `dist/` are gitignored.
