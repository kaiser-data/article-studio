# Article Studio — architecture & layout

A dependency-free static app (`index.html` + `styles.css` + `app/*.js`) served by a
tiny Node backend (`server.js`). No build step: the browser loads plain classic
`<script>` tags in a fixed order.

## Front-end module map

`index.html` loads these in order — **order matters**, because they share one global
scope and `main.js` wires everything on load, so it must come last:

| File | Responsibility |
|------|----------------|
| `shared/frontmatter.js` | YAML front-matter ↔ article serialization (shared with `server.js`) |
| `app/config.js` | Platform definitions, statuses, built-in writing skills |
| `app/state.js` | In-memory state, `localStorage`, IndexedDB image blobs, image compression |
| `app/bridge.js` | Backend + File System Access bridges; article/image/sidecar file I/O; import |
| `app/articles.js` | Article CRUD, templates, repurpose (linked variants), conflict banner |
| `app/render.js` | Sidebar lanes, editor shell, inspector, checklist, people directory |
| `app/agents.js` | Agent handoff (Codex/Claude/Grok), writing-skill picker, AI-assist, images |
| `app/export.js` | Markdown preview, **live publish rail**, calendar, platform-ready export |
| `app/main.js` | Event wiring + boot sequence (**loads last**) |

To re-split or move code, keep this load order and remember every function lives in
one shared global namespace (no imports/exports).

## UI model

- **Focus mode (default):** two columns — article lanes · editor + **live publish rail**.
  The rail shows exactly what you'll paste for the current platform (Unicode for
  LinkedIn, clean Markdown for Medium…). Toggle it with the `◫ Preview` button or `⌘.`.
- **Details (`⋯ Details`):** reveals the inspector as a third column — Guidance,
  Images, Meta, People, Agents. `✨ Agent` jumps straight to the Agents tab.
- **Connection chip** (top bar): click to connect when disconnected, or reload from
  disk (pull in agent edits) when connected.

## `articles/` folder — constraints the app imposes

The layout is not free-form; `server.js` dictates it:

- **Articles must be flat `.md` files** directly in `articles/`. The listing endpoint
  (`readdirSync(ARTICLES_DIR)`) is **non-recursive** — files in subfolders won't appear.
- **Images live in `articles/images/`.** The upload endpoint writes there; articles
  reference them as relative paths (`images/foo.png`) in front-matter `images:`.
- **Sidecars stay in `articles/`.** Only `people.json`, `tagsets.json`,
  `writing-skills.json`, and `voice.md` are whitelisted for read/write there.

Keep new content within these rules and the folder stays sorted automatically.
