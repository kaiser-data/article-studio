# Article Studio

A single-file writing desk for planning, drafting, and shipping articles across
**LinkedIn, Medium, Toastmasters newsletters, Luma events, and blogs** — wired
directly to Codex or Claude Code through plain Markdown files.

## Run it

**Double-click `serve.command`** (macOS). It starts the local backend server and opens
the app in Chrome, usually at `http://127.0.0.1:8765`. If that port is already
occupied, the launcher falls back to `8766`, `8767`, or `8768`.

Why a server? Chrome only allows the folder bridge in a *secure context*. Opening
`index.html` directly as a `file://` page disables it — so serve over localhost:

```
cd article_publisher
node server.js
# then open http://127.0.0.1:8765/index.html in Chrome / Edge / Brave
```

The app still runs as a plain `file://` page, but **Connect folder** only works over
`http://localhost`. Direct Codex runs also require the local backend.

The browser cannot start a backend process by itself, so use `serve.command` to
start the backend. The app checks `/api/health` and enables **Run Codex** when the
backend is running and the `codex` CLI is available on `PATH`.

## The agent bridge

The app and your coding agent edit the **same files**:

1. Click **🔗 Connect folder** in the app and pick the `articles/` folder.
2. Each article is stored as a `.md` file with YAML front-matter:

   ```yaml
   ---
   title: ...
   platform: linkedin   # linkedin | medium | toastmasters | luma | blog
   status: idea         # idea | drafting | ready | posted
   tags: [toastmasters, it]
   summary: ...
   images: [images/foo.png]
   created: ...
   updated: ...
   id: ...
   ---
   body in markdown
   ```

3. Open the **Agents** tab in the inspector and choose **Codex** or
   **Claude Code** as the target.
4. Pick a task (polish, hook, repurpose, alt text, risk review), then either hit
   **Run** (executes the local CLI via the backend) or **Copy prompt** and paste it
   into your own agent session, e.g.:
   - *"Tighten the hook on `articles/welcome-linkedin-post.md` and keep it under 1300 chars."*
   - *"Turn the Medium draft into a Toastmasters newsletter version."*
   - *"Draft 3 LinkedIn post ideas about Kubernetes and drop them in `articles/` as new files."*
5. Back in the app, hit **↻ Reload** to pull edits in.

> Tip: After agent edits files here, this project's convention is to run
> `graphify update .` if you keep a knowledge graph — not required for the app.

## Features

- **Templates** — "+ New article" opens a picker with ready-made skeletons
  (LinkedIn hook-story-CTA / IT how-to, Medium long-form, Luma event, Toastmasters
  newsletter) that pre-fill structure, platform, and tags. ⌘N still makes a blank.
- **Voice guide** (⋯ menu) — your style, rules, and no-gos in one place, saved to
  `articles/voice.md`. The backend prepends it to every Codex/Claude prompt, so
  polishing sharpens your draft without flattening your voice.
- **Pipeline board** — Idea → Drafting → Ready → Posted, filtered by platform.
- **Content calendar & scheduling** — give each article a `publishDate` (Meta tab),
  see a full month calendar (📅 button) with posts colored by platform, plus
  overdue/today/upcoming chips on cards and an upcoming list. Dates round-trip in
  front-matter so the agents see your schedule too.
- **Markdown editor** with Write / Split / Preview and live word + character counts.
- **Pre-publish checklist** — per-platform, in the Tips tab, with a progress bar.
  Measurable items auto-tick live (hook ≤ 210 chars, 3–5 hashtags, word count,
  cover image, image alt text, links out of the LinkedIn body…); the rest are
  manual reminders. Turns the playbooks into an actionable gate before "Posted".
- **Per-platform playbooks** — length targets, hook rules, hashtag and formatting
  tips for LinkedIn, Medium, Toastmasters, Luma, and generic blogs.
- **Image upload** (drag & drop) — auto-compressed/resized on upload (≤1920px),
  saved into `articles/images/` and referenced by relative path, so Medium/Luma
  uploads and agents both see the same files. In browser-only mode, image blobs go
  to **IndexedDB** (not base64 in localStorage) to avoid the ~5MB quota wall.
- **People directory** — save people you want to @mention (name, platform, handle/URL,
  note). Insert mentions into a draft with one click, and **tag people on individual
  photos**. Stored in `articles/people.json` (shared with the agents); photo tags live
  in each article's `imageTags:` front-matter so they survive reloads.
- **Hashtag sets** — reusable tag bundles per topic (Meta tab). Save the current
  article's tags as a named set, then apply a set to any article with one click
  (merged and de-duplicated). Stored in `articles/tagsets.json` (shared with the
  agents), so your LinkedIn hashtag bundles stay consistent across posts.
- **Agent handoff** — choose Codex or Claude Code, generate task prompts for
  polishing, hook rewrites, repurposing, alt text, or risk review; run them
  directly through the backend or copy them into any agent session.
- **Alt-text generation** — the **Alt text** agent task lists every image in the
  article (with its tagged people) and has the agent *open and look at* each file,
  then write concise, descriptive alt text straight into the `![alt](path)`
  Markdown — naming tagged people, ≤125 chars, no "image of" filler. The
  checklist's *"All images have alt text"* item shows a **✨ agent** shortcut that
  jumps straight to this task when images are missing alt text.
- **Switchable agent backend** — when started through `serve.command`, the
  Codex / Claude Code selector runs the edit through the chosen local CLI
  (`codex exec` or `claude -p`) and applies the returned draft in the editor.
- **Conflict-safe sync** — if an agent edits a file you have open, the app
  detects it and shows a banner (*Save my version* / *Load file*) instead of
  silently overwriting. **↻ Reload** warns before discarding unsaved in-app edits.
- **Repurpose** (⤳ button) — one click makes a linked copy of a draft for another
  platform (e.g. a Medium piece → a LinkedIn version). Variants stay connected as a
  set (shown in the Meta tab, jump between them), so one idea can travel across
  LinkedIn, Medium and Toastmasters without copy-paste juggling.
- **Publish-ready export** (⤴ button) — converts a draft to what each platform
  actually accepts: **LinkedIn** (Markdown bold → Unicode bold that survives, links
  pulled into a ready-to-paste *first comment*), **Medium** (clean Markdown), **Plain
  text**, and **Luma** (event description + a downloadable `.ics` from the publish date).
- **Backup / restore** via JSON, plus "Save all to folder".

## Folders

```
article_publisher/
├── index.html              # the app (UI)
├── server.js               # local backend: static files + /api/run (codex / claude)
├── shared/frontmatter.js   # article <-> Markdown schema, shared by app + backend
├── serve.command           # macOS launcher (starts backend, opens Chrome)
├── package.json            # npm start / npm test
├── test/frontmatter.test.js
├── articles/               # ← connect this folder (drafts stay local, git-ignored)
│   ├── welcome-linkedin-post.md
│   └── images/
└── README.md
```

## Development

`shared/frontmatter.js` is the single source of truth for how an article maps to
its Markdown file — imported by both `index.html` (in the browser) and `server.js`
(in Node), so the two can't drift and drop fields.

```
npm start     # run the backend at http://localhost:8765
npm test      # front-matter round-trip test
```

## Browser note

The live folder sync uses the File System Access API (Chromium browsers). On
Safari/Firefox the app still works fully via `localStorage` — use **Export** /
**Import** from the `⋯` menu to move files to/from your agent instead.
