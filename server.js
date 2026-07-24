#!/usr/bin/env node
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn, spawnSync } = require("child_process");
const FM = require("./shared/frontmatter.js");   // single source of truth for article <-> Markdown

const ROOT = __dirname;
const ARTICLES_DIR = path.join(ROOT, "articles");
const PORT = Number(process.env.PORT || 8765);
const CODEX_BIN = process.env.CODEX_BIN || "codex";
const CLAUDE_BIN = process.env.CLAUDE_BIN || "claude";
// Grok Build often lives outside a double-clicked launcher's PATH (~/.grok/bin).
const GROK_BIN = process.env.GROK_BIN || resolveBin("grok", [
  path.join(os.homedir(), ".grok", "bin", "grok"),
  path.join(os.homedir(), ".local", "bin", "grok")
]);

// Local CLIs that edit the article file in place; we read the file back after they finish.
const ENGINES = {
  codex: {
    bin: CODEX_BIN,
    label: "Codex",
    versionArgs: ["--version"],
    // codex takes the prompt as a positional arg. `exec` is already non-interactive,
    // so it has no --ask-for-approval flag — passing one is a hard argument error.
    build: prompt => ({
      args: ["exec", "--cd", ROOT, "--sandbox", "workspace-write", prompt],
      stdin: null
    })
  },
  claude: {
    bin: CLAUDE_BIN,
    label: "Claude Code",
    versionArgs: ["--version"],
    // claude print-mode reads the prompt from stdin; acceptEdits auto-applies file edits,
    // allowedTools scopes it to reading/editing files only (no shell, no network).
    build: prompt => ({
      args: ["-p", "--permission-mode", "acceptEdits", "--allowedTools", "Read,Edit,Write,Glob,Grep"],
      stdin: prompt
    })
  },
  grok: {
    bin: GROK_BIN,
    label: "Grok Build",
    versionArgs: ["--version"],
    // Headless mode: --prompt-file (not stdin) for long article drafts; --yolo auto-approves
    // tools; --tools limits the agent to file read/write (no shell / web / subagents).
    // Some Grok builds linger after the turn and never emit `end` / exit. Treat a
    // streaming `end` event OR quiet stdout after activity as "done", then SIGTERM.
    finishOnStreamingEnd: true,
    finishOnIdleMs: 20_000,
    build: prompt => {
      const tmp = path.join(os.tmpdir(), `article-studio-grok-${process.pid}-${Date.now()}.txt`);
      fs.writeFileSync(tmp, prompt, "utf8");
      return {
        args: [
          "--prompt-file", tmp,
          "--cwd", ROOT,
          "--yolo",
          "--tools", "read_file,search_replace,write,list_dir,grep",
          "--no-subagents",
          "--no-memory",
          "--disable-web-search",
          "--no-auto-update",
          "--output-format", "streaming-json"
        ],
        stdin: null,
        cleanup: [tmp],
        env: { GROK_DISABLE_AUTOUPDATER: "1" }
      };
    }
  }
};

function resolveBin(name, fallbacks) {
  const probe = spawnSync(name, ["--version"], { encoding: "utf8", env: process.env });
  if (!probe.error && probe.status === 0) return name;
  for (const candidate of fallbacks) {
    try {
      if (!fs.existsSync(candidate)) continue;
      const check = spawnSync(candidate, ["--version"], { encoding: "utf8" });
      if (!check.error && check.status === 0) return candidate;
    } catch (e) { /* keep looking */ }
  }
  return name;
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml"
};

// Only allow localhost Host + Origin. Blocks a malicious webpage from POSTing to
// our /api on 127.0.0.1 (browser CSRF / DNS-rebinding) to run the agents.
function localOnly(req) {
  const host = req.headers.host || "";
  const hostOk = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(host);
  const origin = req.headers.origin;
  const originOk = !origin || /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(origin);
  return hostOk && originOk;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/") && !localOnly(req)) {
      return sendJson(res, 403, { error: "Cross-origin request blocked." });
    }
    if (req.method === "GET" && url.pathname === "/api/health") return sendJson(res, 200, {
      ok: true,
      codex: engineAvailable("codex"),
      claude: engineAvailable("claude"),
      grok: engineAvailable("grok"),
      files: true,
      articlesDir: "articles"
    });
    // These handlers are async: they must be awaited, otherwise a rejection escapes
    // this try/catch as an unhandled rejection and takes the whole server down.
    if (req.method === "GET" && url.pathname === "/api/articles") return await handleListArticles(req, res);
    if (url.pathname.startsWith("/api/articles/")) return await handleArticleFile(req, res, url);
    if (url.pathname.startsWith("/api/meta/")) return await handleMetaFile(req, res, url);
    if (req.method === "POST" && url.pathname === "/api/images") return await handleImageUpload(req, res, url);
    if (req.method === "POST" && url.pathname === "/api/run") return await handleRun(req, res);
    if (req.method !== "GET" && req.method !== "HEAD") return sendText(res, 405, "Method not allowed");
    return serveStatic(req, res, url.pathname);
  } catch (err) {
    console.error("Request failed:", req.method, req.url, "\n", err);
    if (!res.headersSent) sendJson(res, 500, { error: err.message || "Server error" });
    else res.end();
  }
});

// Last-resort net: a stray rejection anywhere should be logged, never kill the
// backend mid-session and lose the browser's connection.
process.on("unhandledRejection", err => console.error("Unhandled rejection:", err));

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Article Studio agent backend running at http://127.0.0.1:${PORT}/index.html`);
});

async function handleRun(req, res) {
  const payload = await readJson(req);
  const engineKey = ENGINES[payload.engine] ? payload.engine : "codex";
  const engine = ENGINES[engineKey];

  if (!engineAvailable(engineKey)) {
    return sendJson(res, 400, { error: `\`${engine.bin}\` CLI (${engine.label}) was not found on PATH.` });
  }

  const article = payload.article || {};
  const prompt = payload.prompt || "";
  const fileName = safeArticleFile(article.file || article._file || `${FM.slugify(article.title)}.md`);
  const articlePath = path.join(ARTICLES_DIR, fileName);

  fs.mkdirSync(ARTICLES_DIR, { recursive: true });
  fs.writeFileSync(articlePath, FM.toFrontmatter({ ...article, file: fileName }), "utf8");

  // The author's voice guide (articles/voice.md), if present, is prepended so
  // polishing keeps their style instead of flattening it.
  let voice = "";
  try { voice = fs.readFileSync(path.join(ARTICLES_DIR, "voice.md"), "utf8").trim(); } catch (e) {}

  const fullPrompt = [
    voice ? "Author's voice guide — follow it closely:\n" + voice + "\n" : "",
    prompt,
    "",
    `You are ${engine.label}, running from Article Studio's local backend.`,
    `Edit this file directly: articles/${fileName}`,
    "",
    "Rules:",
    "- Preserve YAML front matter keys.",
    "- Preserve facts and do not invent event details.",
    "- Keep image links as relative paths.",
    "- Match the author's voice guide above.",
    "- Make the requested edit, then finish with a short summary.",
    "- Do not modify unrelated files."
  ].join("\n");

  const run = await runEngine(engineKey, fullPrompt);
  const updated = FM.parseFrontmatter(fs.readFileSync(articlePath, "utf8"), article.id);
  updated._file = fileName;

  sendJson(res, 200, {
    engine: engineKey,
    result: {
      title: updated.title || article.title || "Untitled",
      summary: updated.summary || "",
      body: updated.body || "",
      notes: run.output.trim() || `${engine.label} finished.`
    },
    file: fileName,
    output: run.output
  });
}

async function handleListArticles(req, res) {
  fs.mkdirSync(ARTICLES_DIR, { recursive: true });
  fs.mkdirSync(path.join(ARTICLES_DIR, "images"), { recursive: true });
  const names = fs.readdirSync(ARTICLES_DIR)
    .filter(name => {
      const lower = name.toLowerCase();
      return lower.endsWith(".md") && lower !== "readme.md" && lower !== "voice.md";
    })
    .sort((a, b) => a.localeCompare(b));
  const articles = names.map(file => {
    const full = articlePath(file);
    const stat = fs.statSync(full);
    return { file, mtime: stat.mtimeMs, text: fs.readFileSync(full, "utf8") };
  });
  sendJson(res, 200, {
    ok: true,
    articles,
    people: readJsonSidecar("people.json", []),
    tagsets: readJsonSidecar("tagsets.json", []),
    customSkills: readJsonSidecar("writing-skills.json", []),
    voice: readTextSidecar("voice.md", "")
  });
}

async function handleArticleFile(req, res, url) {
  const fileName = safeArticleFile(decodeURIComponent(url.pathname.slice("/api/articles/".length)));
  const full = articlePath(fileName);
  if (req.method === "GET") {
    if (!fs.existsSync(full)) return sendJson(res, 404, { error: "Article not found." });
    const stat = fs.statSync(full);
    return sendJson(res, 200, { file: fileName, mtime: stat.mtimeMs, text: fs.readFileSync(full, "utf8") });
  }
  if (req.method === "PUT") {
    const payload = await readJson(req);
    fs.mkdirSync(ARTICLES_DIR, { recursive: true });
    if (!payload.force && payload.mtime && fs.existsSync(full)) {
      const stat = fs.statSync(full);
      if (stat.mtimeMs > Number(payload.mtime) + 500) {
        return sendJson(res, 409, { error: "Article changed on disk.", conflict: true, file: fileName, mtime: stat.mtimeMs });
      }
    }
    fs.writeFileSync(full, String(payload.text || ""), "utf8");
    const stat = fs.statSync(full);
    return sendJson(res, 200, { ok: true, file: fileName, mtime: stat.mtimeMs });
  }
  if (req.method === "DELETE") {
    try { fs.unlinkSync(full); } catch (e) {}
    return sendJson(res, 200, { ok: true });
  }
  return sendText(res, 405, "Method not allowed");
}

async function handleMetaFile(req, res, url) {
  if (req.method !== "PUT") return sendText(res, 405, "Method not allowed");
  const name = path.basename(decodeURIComponent(url.pathname.slice("/api/meta/".length)));
  const allowed = new Set(["people.json", "tagsets.json", "writing-skills.json", "voice.md"]);
  if (!allowed.has(name)) return sendJson(res, 400, { error: "Unsupported metadata file." });
  const payload = await readJson(req);
  fs.mkdirSync(ARTICLES_DIR, { recursive: true });
  const full = path.join(ARTICLES_DIR, name);
  const text = name.endsWith(".json")
    ? JSON.stringify(Array.isArray(payload.value) ? payload.value : [], null, 2)
    : String(payload.text || "");
  fs.writeFileSync(full, text, "utf8");
  sendJson(res, 200, { ok: true });
}

async function handleImageUpload(req, res, url) {
  const imagesDir = path.join(ARTICLES_DIR, "images");
  fs.mkdirSync(imagesDir, { recursive: true });
  const slug = (url.searchParams.get("slug") || "article").replace(/[^\w.\-]/g, "-").slice(0, 80) || "article";
  const original = (url.searchParams.get("name") || "image").replace(/[^\w.\-]/g, "_");
  const safe = `${slug}-${Date.now().toString(36)}-${original}`;
  const full = path.join(imagesDir, safe);
  const body = await readBuffer(req, 20_000_000);
  fs.writeFileSync(full, body);
  sendJson(res, 200, { ok: true, path: `images/${safe}` });
}

function runEngine(engineKey, prompt) {
  const engine = ENGINES[engineKey];
  const { args, stdin, cleanup = [], env: extraEnv } = engine.build(prompt);
  const tidy = () => {
    for (const file of cleanup) {
      try { fs.unlinkSync(file); } catch (e) { /* temp file already gone */ }
    }
  };
  return new Promise((resolve, reject) => {
    const child = spawn(engine.bin, args, {
      cwd: ROOT,
      env: extraEnv ? { ...process.env, ...extraEnv } : process.env,
      stdio: [stdin == null ? "ignore" : "pipe", "pipe", "pipe"]
    });
    let output = "";
    let lineBuf = "";
    let settled = false;
    let turnComplete = false;
    let sawActivity = false;
    let lastActivityAt = Date.now();
    let endKillTimer = null;
    const hardTimer = setTimeout(() => {
      child.kill("SIGTERM");
      finish(() => reject(new Error(`${engine.label} timed out after 10 minutes.`)));
    }, 10 * 60 * 1000);

    const idleTimer = engine.finishOnIdleMs
      ? setInterval(() => {
          if (turnComplete || !sawActivity) return;
          if (Date.now() - lastActivityAt >= engine.finishOnIdleMs) {
            markTurnComplete("idle");
          }
        }, 1000)
      : null;

    function finish(fn) {
      if (settled) return;
      settled = true;
      clearTimeout(hardTimer);
      if (idleTimer) clearInterval(idleTimer);
      if (endKillTimer) clearTimeout(endKillTimer);
      tidy();
      fn();
    }

    function markTurnComplete(reason) {
      if (turnComplete) return;
      turnComplete = true;
      // Brief grace period for final file flushes, then stop a lingering process.
      endKillTimer = setTimeout(() => {
        if (!child.killed) child.kill("SIGTERM");
      }, reason === "idle" ? 200 : 800);
    }

    function touchActivity() {
      sawActivity = true;
      lastActivityAt = Date.now();
    }

    function noteChunk(chunk) {
      const text = chunk.toString();
      output += text;
      touchActivity();
      if (!engine.finishOnStreamingEnd || turnComplete) return;
      // NDJSON events may span chunks; buffer incomplete lines.
      lineBuf += text;
      const parts = lineBuf.split(/\r?\n/);
      lineBuf = parts.pop() || "";
      for (const line of parts) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("{")) continue;
        try {
          const evt = JSON.parse(trimmed);
          if (evt && evt.type === "end") markTurnComplete("end");
        } catch (e) { /* non-JSON noise */ }
      }
    }

    child.stdout.on("data", noteChunk);
    child.stderr.on("data", chunk => {
      output += chunk.toString();
      touchActivity();
    });
    child.on("error", err => { finish(() => reject(err)); });
    child.on("close", code => {
      // Exit 0 is success. For Grok, a finished turn (streaming end / idle) also
      // counts even if we had to SIGTERM a process that lingered afterward.
      if (code === 0 || turnComplete) {
        return finish(() => resolve({ output: formatEngineOutput(engineKey, output) }));
      }
      finish(() => reject(new Error(output.trim() || `${engine.label} exited with code ${code}`)));
    });

    if (stdin != null) { child.stdin.write(stdin); child.stdin.end(); }
  });
}

// Grok streaming-json is noisy; surface readable text + a short end summary for the UI notes.
function formatEngineOutput(engineKey, raw) {
  if (engineKey !== "grok" || !raw) return raw;
  const texts = [];
  let endNote = "";
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      const evt = JSON.parse(trimmed);
      if (evt.type === "text" && evt.data) texts.push(evt.data);
      if (evt.type === "end") endNote = "Grok Build finished.";
      if (evt.type === "error" && evt.message) texts.push(String(evt.message));
    } catch (e) { /* ignore */ }
  }
  const joined = texts.join("").trim();
  if (joined) return joined;
  if (endNote) return endNote;
  return raw;
}

function engineAvailable(engineKey) {
  const engine = ENGINES[engineKey];
  if (!engine) return false;
  const check = spawnSync(engine.bin, engine.versionArgs, { encoding: "utf8" });
  return !check.error && check.status === 0;
}

function serveStatic(req, res, pathname) {
  const clean = decodeURIComponent(pathname === "/" ? "/index.html" : pathname);
  const target = path.normalize(path.join(ROOT, clean));
  if (!target.startsWith(ROOT)) return sendText(res, 403, "Forbidden");
  fs.stat(target, (err, stat) => {
    if (err || !stat.isFile()) return sendText(res, 404, "Not found");
    res.writeHead(200, { "Content-Type": MIME[path.extname(target).toLowerCase()] || "application/octet-stream" });
    if (req.method === "HEAD") return res.end();
    fs.createReadStream(target).pipe(res);
  });
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 2_000_000) {
        req.destroy();
        reject(new Error("Request too large"));
      }
    });
    req.on("end", () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch (err) { reject(new Error("Invalid JSON")); }
    });
    req.on("error", reject);
  });
}

function readBuffer(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on("data", chunk => {
      total += chunk.length;
      if (total > maxBytes) {
        req.destroy();
        reject(new Error("Request too large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function safeArticleFile(name) {
  const base = path.basename(name || "untitled.md");
  const clean = base.replace(/[^\w.\-]/g, "-");
  return clean.endsWith(".md") ? clean : `${clean}.md`;
}

function articlePath(fileName) {
  const full = path.join(ARTICLES_DIR, safeArticleFile(fileName));
  const normalized = path.normalize(full);
  if (!normalized.startsWith(ARTICLES_DIR + path.sep)) throw new Error("Invalid article path.");
  return normalized;
}

function readJsonSidecar(name, fallback) {
  try {
    const full = path.join(ARTICLES_DIR, name);
    const value = JSON.parse(fs.readFileSync(full, "utf8"));
    return Array.isArray(value) ? value : fallback;
  } catch (e) { return fallback; }
}

function readTextSidecar(name, fallback) {
  try { return fs.readFileSync(path.join(ARTICLES_DIR, name), "utf8"); }
  catch (e) { return fallback; }
}

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function sendText(res, status, body) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(body);
}
