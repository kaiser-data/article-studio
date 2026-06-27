# Article Studio

A single-file writing desk for planning, drafting, and shipping articles across
**LinkedIn, Medium, Toastmasters newsletters, Luma events, and blogs** — wired
directly to Claude Code through plain Markdown files.

## Run it

Open `index.html` in **Chrome, Edge, or Brave** (these support the folder bridge).

```
open index.html      # macOS
```

## The Claude Code bridge

The app has no backend. It and Claude Code edit the **same files**:

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

3. Ask Claude Code to work on them, e.g.:
   - *"Tighten the hook on `articles/welcome-linkedin-post.md` and keep it under 1300 chars."*
   - *"Turn the Medium draft into a Toastmasters newsletter version."*
   - *"Draft 3 LinkedIn post ideas about Kubernetes and drop them in `articles/` as new files."*
4. Back in the app, hit **↻ Reload** to pull Claude's edits in.

> Tip: After Claude edits files here, this project's convention is to run
> `graphify update .` if you keep a knowledge graph — not required for the app.

## Features

- **Pipeline board** — Idea → Drafting → Ready → Posted, filtered by platform.
- **Markdown editor** with Write / Split / Preview and live word + character counts.
- **Per-platform playbooks** — length targets, hook rules, hashtag and formatting
  tips for LinkedIn, Medium, Toastmasters, Luma, and generic blogs.
- **Image upload** (drag & drop) saved into `articles/images/` and referenced by
  relative path, so Medium/Luma uploads and Claude both see the same files.
- **Backup / restore** via JSON, plus "Save all to folder".

## Folders

```
article_publisher/
├── index.html              # the app
├── articles/               # ← connect this folder
│   ├── welcome-linkedin-post.md
│   └── images/
└── README.md
```

## Browser note

The live folder sync uses the File System Access API (Chromium browsers). On
Safari/Firefox the app still works fully via `localStorage` — use **Export** /
**Import** from the `⋯` menu to move files to/from Claude Code instead.
