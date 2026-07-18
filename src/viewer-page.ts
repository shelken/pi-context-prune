/** Self-contained HTML for the prune conversation viewer (no external CDN). */
export const VIEWER_PAGE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>pruner · tree</title>
<style>
  /* Primer-dark cockpit: zinc surfaces, one amber accent for prune/summary. */
  :root {
    color-scheme: dark;
    --bg: #0d1117;
    --bg-elev: #010409;
    --surface: #161b22;
    --surface-2: #1c2129;
    --surface-open: #21262d;
    --fg: #e6edf3;
    --fg-2: #c9d1d9;
    --muted: #8b949e;
    --faint: #6e7681;
    --line: #30363d;
    --line-soft: #21262d;
    --accent: #d4a017;
    --accent-fg: #f0c14b;
    --accent-dim: rgba(212, 160, 23, 0.12);
    --accent-line: rgba(212, 160, 23, 0.35);
    --focus: #f0c14b;
    --ok: #3fb950;
    --err: #f85149;
    --err-dim: rgba(248, 81, 73, 0.12);
    --code-bg: #0d1117;
    --rail-user: #58a6ff;
    --rail-assistant: #3fb950;
    --rail-tool: #d29922;
    --rail-summary: #d4a017;
    --rail-other: #8b949e;
    --shadow: 0 1px 0 rgba(1, 4, 9, 0.6);
    --mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
    --sans: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    --r: 6px;
  }
  @media (prefers-color-scheme: light) {
    :root {
      color-scheme: light;
      --bg: #f6f8fa;
      --bg-elev: #ffffff;
      --surface: #ffffff;
      --surface-2: #f6f8fa;
      --surface-open: #ffffff;
      --fg: #1f2328;
      --fg-2: #424a53;
      --muted: #656d76;
      --faint: #8c959f;
      --line: #d0d7de;
      --line-soft: #eaeef2;
      --accent: #9a6700;
      --accent-fg: #7d4e00;
      --accent-dim: rgba(154, 103, 0, 0.1);
      --accent-line: rgba(154, 103, 0, 0.3);
      --focus: #9a6700;
      --ok: #1a7f37;
      --err: #cf222e;
      --err-dim: rgba(207, 34, 46, 0.08);
      --code-bg: #f6f8fa;
      --rail-user: #0969da;
      --rail-assistant: #1a7f37;
      --rail-tool: #9a6700;
      --rail-summary: #9a6700;
      --rail-other: #656d76;
      --shadow: 0 1px 0 rgba(31, 35, 40, 0.04);
    }
  }

  * { box-sizing: border-box; }
  html, body { height: 100%; }
  body {
    margin: 0;
    font: 13px/1.45 var(--sans);
    background:
      radial-gradient(1200px 400px at 50% -120px, var(--accent-dim), transparent 60%),
      var(--bg);
    color: var(--fg);
    -webkit-font-smoothing: antialiased;
  }

  /* —— chrome —— */
  .top {
    position: sticky;
    top: 0;
    z-index: 10;
    border-bottom: 1px solid var(--line);
    background: color-mix(in srgb, var(--bg-elev) 88%, transparent);
    backdrop-filter: blur(12px) saturate(1.2);
    -webkit-backdrop-filter: blur(12px) saturate(1.2);
    box-shadow: var(--shadow);
  }
  @media (prefers-reduced-transparency: reduce) {
    .top {
      background: var(--bg-elev);
      backdrop-filter: none;
      -webkit-backdrop-filter: none;
    }
  }
  .top-inner {
    max-width: 1080px;
    margin: 0 auto;
    padding: 10px 16px;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px 14px;
  }
  .brand {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .mark {
    width: 18px;
    height: 18px;
    border-radius: 4px;
    background: linear-gradient(145deg, var(--accent-fg), var(--accent));
    box-shadow: inset 0 1px 0 rgba(255,255,255,.25);
    flex: 0 0 auto;
  }
  .brand h1 {
    margin: 0;
    font: 600 13px/1 var(--mono);
    letter-spacing: 0.02em;
    color: var(--fg);
  }
  .brand h1 span {
    color: var(--muted);
    font-weight: 500;
  }
  #meta {
    flex: 1 1 220px;
    min-width: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
    font: 12px/1.2 var(--mono);
    color: var(--muted);
  }
  .stat {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 8px;
    border-radius: 999px;
    border: 1px solid var(--line);
    background: var(--surface);
    color: var(--fg-2);
    white-space: nowrap;
  }
  .stat b {
    color: var(--fg);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .stat.warn {
    border-color: var(--accent-line);
    background: var(--accent-dim);
    color: var(--accent-fg);
  }
  .stat.live::before {
    content: "";
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--ok);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--ok) 25%, transparent);
  }
  .stat.offline::before {
    content: "";
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--err);
  }
  .hint {
    color: var(--faint);
    font-size: 11px;
  }

  /* —— stream —— */
  #list {
    max-width: 1080px;
    margin: 0 auto;
    padding: 12px 16px 72px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .empty {
    margin: 72px auto;
    max-width: 440px;
    padding: 20px 22px;
    border: 1px dashed var(--line);
    border-radius: var(--r);
    background: var(--surface);
    color: var(--muted);
    text-align: left;
    line-height: 1.55;
    font-size: 13px;
  }
  .empty code {
    font-family: var(--mono);
    font-size: 12px;
    color: var(--accent-fg);
  }

  /* —— rows —— */
  .row {
    content-visibility: auto;
    contain-intrinsic-size: auto 44px;
    position: relative;
    display: grid;
    grid-template-columns: 3px 1fr;
    border: 1px solid var(--line);
    border-radius: var(--r);
    background: var(--surface);
    overflow: hidden;
  }
  .row.open {
    background: var(--surface-open);
    border-color: color-mix(in srgb, var(--line) 70%, var(--fg) 12%);
  }
  .row.error {
    border-color: color-mix(in srgb, var(--err) 45%, var(--line));
    background: color-mix(in srgb, var(--err-dim) 80%, var(--surface));
  }
  .rail { background: var(--rail-other); opacity: 0.85; }
  .row.user .rail { background: var(--rail-user); }
  .row.assistant .rail { background: var(--rail-assistant); }
  .row.toolResult .rail { background: var(--rail-tool); }
  .row.summary .rail { background: var(--rail-summary); }
  .row.other .rail { background: var(--rail-other); }
  .row.summary {
    background: color-mix(in srgb, var(--accent-dim) 55%, var(--surface));
  }
  .row.summary.open {
    background: color-mix(in srgb, var(--accent-dim) 80%, var(--surface-open));
    border-color: var(--accent-line);
  }

  .main { min-width: 0; }
  .head {
    display: grid;
    grid-template-columns: 18px auto minmax(0, 1fr) auto;
    gap: 8px;
    align-items: center;
    padding: 8px 10px;
    cursor: pointer;
    user-select: none;
  }
  .head:hover { background: color-mix(in srgb, var(--fg) 3%, transparent); }
  .head:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: -2px;
  }
  .chev {
    width: 18px;
    height: 18px;
    display: grid;
    place-items: center;
    color: var(--faint);
    transition: transform 0.12s ease;
  }
  .row.open .chev { transform: rotate(90deg); color: var(--muted); }
  .chev svg { display: block; }

  .kind {
    display: inline-flex;
    align-items: center;
    height: 20px;
    padding: 0 7px;
    border-radius: 999px;
    border: 1px solid var(--line);
    background: var(--surface-2);
    font: 600 10px/1 var(--mono);
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--muted);
    white-space: nowrap;
  }
  .row.user .kind { color: var(--rail-user); border-color: color-mix(in srgb, var(--rail-user) 35%, var(--line)); }
  .row.assistant .kind { color: var(--rail-assistant); border-color: color-mix(in srgb, var(--rail-assistant) 35%, var(--line)); }
  .row.toolResult .kind { color: var(--rail-tool); border-color: color-mix(in srgb, var(--rail-tool) 35%, var(--line)); }
  .row.summary .kind {
    color: var(--accent-fg);
    border-color: var(--accent-line);
    background: var(--accent-dim);
  }
  .row.error .kind { color: var(--err); border-color: color-mix(in srgb, var(--err) 40%, var(--line)); }

  .preview {
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--fg-2);
    font-size: 13px;
  }
  .row.open .preview { color: var(--fg); }

  .meta-right {
    display: flex;
    gap: 5px;
    align-items: center;
    justify-content: flex-end;
    color: var(--faint);
    font: 11px/1 var(--mono);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    max-width: 42vw;
    overflow: hidden;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    max-width: 200px;
    height: 20px;
    padding: 0 7px;
    border-radius: 999px;
    border: 1px solid var(--line);
    background: var(--surface-2);
    color: var(--fg-2);
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .chip.model {
    border-color: var(--accent-line);
    background: var(--accent-dim);
    color: var(--accent-fg);
  }
  .dot {
    color: var(--line);
    user-select: none;
  }

  .body {
    display: none;
    border-top: 1px solid var(--line-soft);
    padding: 12px 14px 14px 28px;
    background: color-mix(in srgb, var(--bg) 35%, var(--surface));
  }
  .row.open .body { display: block; }

  /* —— markdown —— */
  .md {
    max-width: 78ch;
    color: var(--fg);
    word-break: break-word;
  }
  .md > *:first-child { margin-top: 0; }
  .md > *:last-child { margin-bottom: 0; }
  .md p { margin: 0.5em 0; color: var(--fg-2); }
  .md h1, .md h2, .md h3, .md h4 {
    margin: 0.85em 0 0.35em;
    line-height: 1.3;
    font-weight: 650;
    color: var(--fg);
    letter-spacing: -0.01em;
  }
  .md h1 { font-size: 1.2rem; }
  .md h2 { font-size: 1.08rem; }
  .md h3 { font-size: 1rem; }
  .md ul, .md ol { margin: 0.45em 0; padding-left: 1.25em; color: var(--fg-2); }
  .md li { margin: 0.18em 0; }
  .md blockquote {
    margin: 0.55em 0;
    padding: 0.15em 0 0.15em 0.85em;
    border-left: 2px solid var(--accent);
    color: var(--muted);
  }
  .md a { color: var(--rail-user); text-decoration: underline; text-underline-offset: 2px; }
  .md a:hover { color: var(--fg); }
  .md code {
    font-family: var(--mono);
    font-size: 0.9em;
    padding: 0.12em 0.35em;
    border-radius: 4px;
    border: 1px solid var(--line-soft);
    background: var(--code-bg);
    color: var(--fg);
  }
  .md pre {
    margin: 0.65em 0;
    padding: 10px 12px;
    overflow: auto;
    border-radius: var(--r);
    border: 1px solid var(--line);
    background: var(--code-bg);
    max-height: 420px;
  }
  .md pre code {
    padding: 0;
    border: 0;
    background: transparent;
    font-size: 12px;
    line-height: 1.5;
  }
  .md hr {
    border: 0;
    border-top: 1px solid var(--line);
    margin: 0.9em 0;
  }
  .md table {
    border-collapse: collapse;
    width: 100%;
    margin: 0.65em 0;
    font-size: 12.5px;
  }
  .md th, .md td {
    border: 1px solid var(--line);
    padding: 5px 8px;
    text-align: left;
  }
  .md th {
    background: var(--surface-2);
    color: var(--fg);
    font-weight: 600;
  }

  /* —— linked originals —— */
  .linked {
    margin-top: 14px;
    padding-top: 12px;
    border-top: 1px dashed var(--line);
  }
  .linked h3 {
    margin: 0 0 8px;
    font: 600 10px/1 var(--mono);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--faint);
  }
  .linked details {
    margin-bottom: 6px;
    border: 1px solid var(--line);
    border-radius: var(--r);
    background: var(--surface);
  }
  .linked details[open] {
    border-color: color-mix(in srgb, var(--line) 60%, var(--accent) 25%);
  }
  .linked summary {
    cursor: pointer;
    padding: 8px 10px;
    color: var(--muted);
    font: 12px/1.35 var(--mono);
    list-style: none;
  }
  .linked summary::-webkit-details-marker { display: none; }
  .linked summary::before {
    content: "▸";
    display: inline-block;
    width: 1em;
    color: var(--faint);
  }
  .linked details[open] summary::before { content: "▾"; color: var(--accent-fg); }
  .linked summary:hover { color: var(--fg); background: color-mix(in srgb, var(--fg) 3%, transparent); }
  .muted { color: var(--muted); }
  .linked .orig {
    margin: 0;
    padding: 0 10px 10px;
    max-height: 320px;
    overflow: auto;
    white-space: pre-wrap;
    word-break: break-word;
    font: 12px/1.5 var(--mono);
    color: var(--fg-2);
  }

  @media (max-width: 720px) {
    .head {
      grid-template-columns: 18px auto minmax(0, 1fr);
      grid-template-rows: auto auto;
    }
    .meta-right {
      grid-column: 2 / -1;
      max-width: none;
      justify-content: flex-start;
    }
    .body { padding-left: 14px; }
  }
</style>
</head>
<body data-pruner-viewer="5">
  <header class="top">
    <div class="top-inner">
      <div class="brand">
        <span class="mark" aria-hidden="true"></span>
        <h1>pruner <span>/ tree</span></h1>
      </div>
      <div id="meta"><span class="stat live">connecting</span></div>
    </div>
  </header>
  <div id="list"></div>
<script>
(function () {
  const list = document.getElementById("list");
  const meta = document.getElementById("meta");
  /** @type {Map<string, any>} */
  const rowData = new Map();
  let lastKey = "";
  let stickBottom = true;
  /** @type {Set<string>} */
  const openIds = new Set();

  const CHEV =
    '<span class="chev" aria-hidden="true"><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M4.5 2.5L8 6l-3.5 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></span>';

  function esc(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function fmtChars(n) {
    if (n == null) return "";
    if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(1) + "k";
    return String(n);
  }

  // Minimal markdown → HTML. Fences first, then escape, then inline/block rules.
  function renderMarkdown(src) {
    const raw = String(src ?? "");
    const fences = [];
    let text = raw.replace(/\`\`\`([\\w-]*)\\n([\\s\\S]*?)\`\`\`/g, (_, lang, code) => {
      const i = fences.length;
      fences.push(
        '<pre><code class="lang-' + esc(lang || "text") + '">' + esc(code.replace(/\\n$/, "")) + "</code></pre>"
      );
      return "\\0F" + i + "\\0";
    });

    text = esc(text);

    // tables (simple GFM)
    text = text.replace(/(?:^|\\n)((?:\\|[^\\n]+\\|\\n)+)/g, (block) => {
      const lines = block.trim().split("\\n").filter(Boolean);
      if (lines.length < 2 || !/^\\|?\\s*:?-+:?\\s*(\\|\\s*:?-+:?\\s*)+\\|?$/.test(lines[1].trim())) {
        return block;
      }
      const split = (line) =>
        line.replace(/^\\|/, "").replace(/\\|$/, "").split("|").map((c) => c.trim());
      const head = split(lines[0]);
      const body = lines.slice(2).map(split);
      let html = "<table><thead><tr>" + head.map((c) => "<th>" + c + "</th>").join("") + "</tr></thead><tbody>";
      for (const row of body) {
        html += "<tr>" + row.map((c) => "<td>" + c + "</td>").join("") + "</tr>";
      }
      return "\\n" + html + "</tbody></table>\\n";
    });

    text = text
      .replace(/^######\\s+(.+)$/gm, "<h4>$1</h4>")
      .replace(/^#####\\s+(.+)$/gm, "<h4>$1</h4>")
      .replace(/^####\\s+(.+)$/gm, "<h4>$1</h4>")
      .replace(/^###\\s+(.+)$/gm, "<h3>$1</h3>")
      .replace(/^##\\s+(.+)$/gm, "<h2>$1</h2>")
      .replace(/^#\\s+(.+)$/gm, "<h1>$1</h1>")
      .replace(/^>\\s?(.+)$/gm, "<blockquote>$1</blockquote>")
      .replace(/^(-{3,}|\\*{3,})$/gm, "<hr>")
      .replace(/\`([^\\\`]+)\`/g, "<code>$1</code>")
      .replace(/\\*\\*([^*]+)\\*\\*/g, "<strong>$1</strong>")
      .replace(/__([^_]+)__/g, "<strong>$1</strong>")
      .replace(/(?<!\\*)\\*([^*]+)\\*(?!\\*)/g, "<em>$1</em>")
      .replace(/\\[([^\\]]+)\\]\\(([^)]+)\\)/g, (_, label, href) => {
        const h = String(href || "");
        const lower = h.toLowerCase();
        const safe =
          lower.startsWith("https://") ||
          lower.startsWith("http://") ||
          h.startsWith("/") ||
          h.startsWith("#")
            ? h
            : "#";
        return '<a href="' + safe + '" rel="noreferrer noopener">' + label + "</a>";
      });

    // unordered lists
    text = text.replace(/(?:(?:^|\\n)(?:[*+-])\\s+.+)(?:\\n(?:[*+-])\\s+.+)*/g, (block) => {
      const items = block.trim().split("\\n").map((line) => line.replace(/^[*+-]\\s+/, ""));
      return "<ul>" + items.map((i) => "<li>" + i + "</li>").join("") + "</ul>";
    });

    // ordered lists
    text = text.replace(/(?:(?:^|\\n)\\d+\\.\\s+.+)(?:\\n\\d+\\.\\s+.+)*/g, (block) => {
      const items = block.trim().split("\\n").map((line) => line.replace(/^\\d+\\.\\s+/, ""));
      return "<ol>" + items.map((i) => "<li>" + i + "</li>").join("") + "</ol>";
    });

    // paragraphs for remaining plain lines
    text = text
      .split(/\\n{2,}/)
      .map((chunk) => {
        const t = chunk.trim();
        if (!t) return "";
        if (/^<(h\\d|ul|ol|pre|table|blockquote|hr|p)\\b/i.test(t)) return t;
        if (t.includes("\\0F")) return t;
        return "<p>" + t.replace(/\\n/g, "<br>") + "</p>";
      })
      .join("\\n");

    text = text.replace(/\\0F(\\d+)\\0/g, (_, i) => fences[Number(i)] || "");
    return text;
  }

  function metaBits(row) {
    const bits = [];
    if (row.kind === "summary") {
      bits.push(
        '<span class="chip model" title="summarizer model">' +
          esc(row.summarizerModel || "model unknown") +
          "</span>",
      );
    }
    if (row.toolName) bits.push('<span class="chip">' + esc(row.toolName) + "</span>");
    if (row.toolCallId) bits.push('<span class="chip">' + esc(String(row.toolCallId).slice(0, 8)) + "</span>");
    if (row.summaryChars != null) bits.push('<span class="chip">' + fmtChars(row.summaryChars) + " sum</span>");
    if (row.linkedTools && row.linkedTools.length) {
      const orig = row.linkedTools.reduce((s, t) => s + (t.originalChars || 0), 0);
      bits.push('<span class="chip">' + row.linkedTools.length + " tools · " + fmtChars(orig) + "</span>");
    }
    return bits.join("");
  }

  function ensureBody(article, row) {
    const body = article.querySelector(".body");
    if (!body || body.dataset.ready === "1") return;
    let html = '<div class="md">' + renderMarkdown(row.body || "") + "</div>";
    if (row.linkedTools && row.linkedTools.length) {
      html +=
        '<div class="linked"><h3>Original tool results</h3>' +
        row.linkedTools
          .map((t) => {
            return (
              '<details data-tool-id="' +
              esc(t.toolCallId) +
              '">' +
              "<summary>" +
              esc(t.shortId) +
              " · " +
              esc(t.toolName) +
              " · " +
              esc(t.toolCallId) +
              (t.isError ? " · error" : "") +
              " · " +
              fmtChars(t.originalChars || 0) +
              " chars</summary>" +
              '<pre class="orig" data-orig="1">' +
              (t.originalBody
                ? esc(t.originalBody)
                : '<span class="muted">expand to load…</span>') +
              "</pre></details>"
            );
          })
          .join("") +
        "</div>";
    }
    body.innerHTML = html;
    body.dataset.ready = "1";
    body.querySelectorAll("details[data-tool-id]").forEach((d) => {
      d.addEventListener("toggle", () => {
        if (!d.open) return;
        loadOriginal(d);
      });
    });
  }

  async function loadOriginal(detailsEl) {
    const pre = detailsEl.querySelector("pre.orig");
    if (!pre || pre.dataset.loaded === "1") return;
    const id = detailsEl.getAttribute("data-tool-id") || "";
    if (!id) return;
    pre.textContent = "loading original…";
    try {
      const res = await fetch("/api/original?id=" + encodeURIComponent(id), {
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      pre.textContent = data.text || "";
      pre.dataset.loaded = "1";
    } catch (err) {
      pre.textContent = "failed: " + (err && err.message ? err.message : err);
    }
  }

  function renderMetaBar(doc, opts) {
    const offline = opts && opts.offline;
    const loading = opts && opts.loading;
    if (offline) {
      meta.innerHTML =
        '<span class="stat offline">offline</span>' +
        '<span class="hint">' +
        esc(opts.message || "re-run /pruner tree") +
        "</span>";
      return;
    }
    if (loading) {
      meta.innerHTML = '<span class="stat live">loading snapshot…</span>';
      return;
    }
    if (!doc) {
      meta.innerHTML = '<span class="stat live">connecting</span>';
      return;
    }
    const shown = doc.stats?.messageCount ?? (doc.rows || []).length;
    const total = doc.stats?.totalMessageCount ?? shown;
    const truncated = !!doc.stats?.truncated;
    const label = doc.sessionLabel || doc.sessionId || "session";
    const when = new Date(doc.timestamp).toLocaleString();
    meta.innerHTML =
      '<span class="stat live" title="' +
      esc(when) +
      '">' +
      esc(label) +
      "</span>" +
      '<span class="stat"><b>' +
      shown +
      "</b>" +
      (truncated ? " / " + total : "") +
      " rows</span>" +
      (truncated ? '<span class="stat warn">windowed</span>' : "") +
      '<span class="stat"><b>' +
      (doc.stats?.summaryCount ?? 0) +
      "</b> summaries</span>" +
      '<span class="stat"><b>' +
      (doc.stats?.prunedToolCount ?? 0) +
      "</b> pruned</span>";
  }

  function renderShell(doc) {
    renderMetaBar(doc);

    const rows = doc.rows || [];
    rowData.clear();
    if (rows.length === 0) {
      list.innerHTML =
        '<div class="empty">No agent-visible messages in this snapshot.<br><br>' +
        "session: <code>" +
        esc(doc.sessionLabel || doc.sessionId || "?") +
        "</code><br>" +
        "branch entries: <code>" +
        String(doc.stats?.branchEntryCount ?? "?") +
        "</code> · rows: <code>0</code><br><br>" +
        "If branch entries is 0, <code>/pruner tree</code> saw an empty session path (reload pi and retry). " +
        "If branch &gt; 0 but rows 0, entry parsing failed.</div>";
      return;
    }

    // Window is already ≤ VIEWER_ROW_WINDOW; single paint avoids rAF re-entry races on poll.
    const parts = new Array(rows.length);
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      rowData.set(row.id, row);
      const isOpen = openIds.has(row.id);
      const err = row.isError ? " error" : "";
      const open = isOpen ? " open" : "";
      parts[i] =
        '<article class="row ' +
        esc(row.kind) +
        err +
        open +
        '" data-id="' +
        esc(row.id) +
        '">' +
        '<div class="rail" aria-hidden="true"></div>' +
        '<div class="main">' +
        '<div class="head" tabindex="0" role="button" aria-expanded="' +
        (isOpen ? "true" : "false") +
        '">' +
        CHEV +
        '<div class="kind">' +
        esc(row.roleLabel || row.kind) +
        "</div>" +
        '<div class="preview">' +
        esc(row.preview || "") +
        "</div>" +
        '<div class="meta-right">' +
        metaBits(row) +
        "</div>" +
        "</div>" +
        '<div class="body"></div>' +
        "</div></article>";
    }
    list.innerHTML = parts.join("");

    for (const id of openIds) {
      const article = list.querySelector('[data-id="' + CSS.escape(id) + '"]');
      const row = rowData.get(id);
      if (article && row) ensureBody(article, row);
    }
  }

  function toggle(article) {
    const id = article.getAttribute("data-id");
    if (!id) return;
    const row = rowData.get(id);
    if (!row) return;
    const open = !article.classList.contains("open");
    article.classList.toggle("open", open);
    const head = article.querySelector(".head");
    if (head) head.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) {
      openIds.add(id);
      ensureBody(article, row);
    } else {
      openIds.delete(id);
    }
  }

  list.addEventListener("click", (e) => {
    const head = e.target.closest(".head");
    if (!head || e.target.closest("a, summary, details, pre, code")) return;
    const article = head.closest(".row");
    if (article) toggle(article);
  });
  list.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const head = e.target.closest(".head");
    if (!head) return;
    e.preventDefault();
    const article = head.closest(".row");
    if (article) toggle(article);
  });

  // Throttled stick-to-bottom tracking (no layout work beyond a rAF flag).
  let scrollRaf = 0;
  window.addEventListener(
    "scroll",
    () => {
      if (scrollRaf) return;
      scrollRaf = requestAnimationFrame(() => {
        scrollRaf = 0;
        stickBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 48;
      });
    },
    { passive: true },
  );

  let loading = false;
  async function load() {
    if (loading) return;
    loading = true;
    try {
      const metaRes = await fetch("/api/meta", {
        cache: "no-store",
        signal: AbortSignal.timeout(4000),
      });
      if (!metaRes.ok) throw new Error("HTTP " + metaRes.status);
      const m = await metaRes.json();
      const key =
        String(m.sessionId || "") +
        ":" +
        String(m.timestamp || 0) +
        ":" +
        String(m.messageCount ?? 0);
      if (key === lastKey) return;

      renderMetaBar(null, { loading: true });
      const res = await fetch("/api/latest", {
        cache: "no-store",
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const doc = await res.json();
      lastKey = key;
      renderShell(doc);
      if (stickBottom) {
        requestAnimationFrame(() => window.scrollTo(0, document.body.scrollHeight));
      }
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      renderMetaBar(null, {
        offline: true,
        message: msg + " — re-run /pruner tree in pi",
      });
      if (!lastKey) {
        list.innerHTML =
          '<div class="empty">Viewer server not reachable.<br><br>In pi: <code>/pruner tree</code></div>';
      }
    } finally {
      loading = false;
    }
  }

  function hello() {
    // Refcount ++ once per page load; bye -- on pagehide. Not on heartbeat.
    fetch("/api/hello", {
      method: "POST",
      keepalive: true,
      signal: AbortSignal.timeout(3000),
    }).catch(() => {});
  }

  function beat() {
    fetch("/api/heartbeat", {
      method: "POST",
      keepalive: true,
      signal: AbortSignal.timeout(3000),
    }).catch(() => {});
  }

  window.addEventListener("pagehide", () => {
    try {
      navigator.sendBeacon("/api/bye");
    } catch (_) {}
  });

  hello();
  load();
  setInterval(load, 2500);
  beat();
  setInterval(beat, 5000);
})();
</script>
</body>
</html>
`;
