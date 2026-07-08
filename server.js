#!/usr/bin/env node
const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn, spawnSync } = require("child_process");
const FM = require("./shared/frontmatter.js");   // single source of truth for article <-> Markdown

const ROOT = __dirname;
const ARTICLES_DIR = path.join(ROOT, "articles");
const PORT = Number(process.env.PORT || 8765);
const CODEX_BIN = process.env.CODEX_BIN || "codex";
const CLAUDE_BIN = process.env.CLAUDE_BIN || "claude";

// Both engines are local CLIs that edit the article file in place, then we read it back.
const ENGINES = {
  codex: {
    bin: CODEX_BIN,
    label: "Codex",
    versionArgs: ["--version"],
    // codex takes the prompt as a positional arg
    build: prompt => ({
      args: ["exec", "--cd", ROOT, "--sandbox", "workspace-write", "--ask-for-approval", "never", prompt],
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
  }
};

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
      claude: engineAvailable("claude")
    });
    // /api/run is the unified endpoint; /api/codex kept as a backward-compatible alias
    if (req.method === "POST" && (url.pathname === "/api/run" || url.pathname === "/api/codex")) return handleRun(req, res);
    if (req.method !== "GET" && req.method !== "HEAD") return sendText(res, 405, "Method not allowed");
    return serveStatic(req, res, url.pathname);
  } catch (err) {
    sendJson(res, 500, { error: err.message || "Server error" });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Article Studio Codex backend running at http://127.0.0.1:${PORT}/index.html`);
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

function runEngine(engineKey, prompt) {
  const engine = ENGINES[engineKey];
  const { args, stdin } = engine.build(prompt);
  return new Promise((resolve, reject) => {
    const child = spawn(engine.bin, args, {
      cwd: ROOT,
      env: process.env,
      stdio: [stdin == null ? "ignore" : "pipe", "pipe", "pipe"]
    });
    let output = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`${engine.label} timed out after 10 minutes.`));
    }, 10 * 60 * 1000);

    child.stdout.on("data", chunk => { output += chunk.toString(); });
    child.stderr.on("data", chunk => { output += chunk.toString(); });
    child.on("error", err => { clearTimeout(timer); reject(err); });
    child.on("close", code => {
      clearTimeout(timer);
      if (code === 0) resolve({ output });
      else reject(new Error(output.trim() || `${engine.label} exited with code ${code}`));
    });

    if (stdin != null) { child.stdin.write(stdin); child.stdin.end(); }
  });
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

function safeArticleFile(name) {
  const base = path.basename(name || "untitled.md");
  const clean = base.replace(/[^\w.\-]/g, "-");
  return clean.endsWith(".md") ? clean : `${clean}.md`;
}

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function sendText(res, status, body) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(body);
}
