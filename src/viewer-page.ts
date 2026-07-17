/** Self-contained HTML for the prune conversation viewer (no external CDN). */
export const VIEWER_PAGE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>pruner tree</title>
<style>
  :root {
    color-scheme: dark;
    --bg: #0c0e12;
    --panel: #12151c;
    --row: #161a22;
    --row-open: #1a1f2a;
    --fg: #e8eaed;
    --muted: #8b93a7;
    --line: #262b36;
    --accent: #3d9a8b;
    --accent-dim: rgba(61, 154, 139, 0.14);
    --user: #2a3548;
    --assistant: #1c2a24;
    --tool: #2a261c;
    --summary: #1f2433;
    --err: #3a1c1c;
    --code-bg: #0a0c10;
    --focus: #3d9a8b;
  }
  @media (prefers-color-scheme: light) {
    :root {
      color-scheme: light;
      --bg: #f4f5f7;
      --panel: #ffffff;
      --row: #ffffff;
      --row-open: #f8f9fb;
      --fg: #14171f;
      --muted: #5c6578;
      --line: #d8dde8;
      --accent: #0f766e;
      --accent-dim: rgba(15, 118, 110, 0.1);
      --user: #eef3fb;
      --assistant: #eef8f3;
      --tool: #faf6eb;
      --summary: #eef1f8;
      --err: #fdecec;
      --code-bg: #f0f2f6;
    }
  }
  * { box-sizing: border-box; }
  html, body { height: 100%; }
  body {
    margin: 0;
    font: 13.5px/1.45 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    background: var(--bg);
    color: var(--fg);
  }
  header {
    position: sticky;
    top: 0;
    z-index: 5;
    display: flex;
    gap: 12px;
    align-items: center;
    flex-wrap: wrap;
    padding: 10px 18px;
    border-bottom: 1px solid var(--line);
    background: var(--panel);
  }
  header h1 {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.01em;
  }
  header .meta {
    color: var(--muted);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }
  #list {
    max-width: 960px;
    margin: 0 auto;
    padding: 14px 16px 64px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .empty {
    margin: 64px auto;
    max-width: 420px;
    color: var(--muted);
    text-align: center;
    line-height: 1.6;
  }
  .row {
    content-visibility: auto;
    contain-intrinsic-size: auto 48px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--row);
  }
  .row.open { background: var(--row-open); }
  .row.user { background: color-mix(in srgb, var(--user) 70%, var(--row)); }
  .row.assistant { background: color-mix(in srgb, var(--assistant) 70%, var(--row)); }
  .row.toolResult { background: color-mix(in srgb, var(--tool) 70%, var(--row)); }
  .row.summary { background: color-mix(in srgb, var(--summary) 80%, var(--row)); }
  .row.error { outline: 1px solid color-mix(in srgb, #ef4444 50%, var(--line)); }
  .head {
    display: grid;
    grid-template-columns: 88px minmax(0, 1fr) auto;
    gap: 10px;
    align-items: center;
    padding: 9px 12px;
    cursor: pointer;
    user-select: none;
  }
  .head:hover { filter: brightness(1.04); }
  .head:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: -2px;
  }
  .kind {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .row.summary .kind { color: var(--accent); }
  .preview {
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--fg);
  }
  .meta-right {
    display: flex;
    gap: 6px;
    align-items: center;
    color: var(--muted);
    font-size: 11.5px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    max-width: 220px;
    padding: 2px 7px;
    border-radius: 999px;
    border: 1px solid var(--line);
    background: var(--accent-dim);
    color: var(--fg);
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .body {
    display: none;
    border-top: 1px solid var(--line);
    padding: 12px 14px 14px;
  }
  .row.open .body { display: block; }
  .md {
    max-width: 75ch;
    color: var(--fg);
    word-break: break-word;
  }
  .md > *:first-child { margin-top: 0; }
  .md > *:last-child { margin-bottom: 0; }
  .md p { margin: 0.55em 0; }
  .md h1, .md h2, .md h3, .md h4 {
    margin: 0.9em 0 0.4em;
    line-height: 1.25;
    font-weight: 650;
    text-wrap: pretty;
  }
  .md h1 { font-size: 1.25rem; }
  .md h2 { font-size: 1.1rem; }
  .md h3 { font-size: 1rem; }
  .md ul, .md ol { margin: 0.5em 0; padding-left: 1.3em; }
  .md li { margin: 0.2em 0; }
  .md blockquote {
    margin: 0.6em 0;
    padding: 0.2em 0 0.2em 0.9em;
    border-left: 2px solid var(--accent);
    color: var(--muted);
  }
  .md a { color: var(--accent); }
  .md code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.9em;
    padding: 0.1em 0.35em;
    border-radius: 4px;
    background: var(--code-bg);
  }
  .md pre {
    margin: 0.7em 0;
    padding: 10px 12px;
    overflow: auto;
    border-radius: 8px;
    border: 1px solid var(--line);
    background: var(--code-bg);
    max-height: 420px;
  }
  .md pre code {
    padding: 0;
    background: transparent;
    font-size: 12px;
    line-height: 1.45;
  }
  .md hr {
    border: 0;
    border-top: 1px solid var(--line);
    margin: 1em 0;
  }
  .md table {
    border-collapse: collapse;
    width: 100%;
    margin: 0.7em 0;
    font-size: 12.5px;
  }
  .md th, .md td {
    border: 1px solid var(--line);
    padding: 4px 8px;
    text-align: left;
  }
  .linked {
    margin-top: 12px;
    padding-top: 10px;
    border-top: 1px dashed var(--line);
  }
  .linked h3 {
    margin: 0 0 8px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .linked details {
    margin-bottom: 6px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--panel);
  }
  .linked summary {
    cursor: pointer;
    padding: 8px 10px;
    color: var(--muted);
    font-size: 12px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  .muted { color: var(--muted); }
  .linked .orig {
    margin: 0;
    padding: 0 10px 10px;
    max-height: 320px;
    overflow: auto;
    white-space: pre-wrap;
    word-break: break-word;
    font: 12px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace;
  }
</style>
</head>
<body data-pruner-viewer="3">
  <header>
    <h1>pruner tree</h1>
    <div class="meta" id="meta">loading…</div>
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
        const safe = /^(https?:|\/|#)/i.test(href) ? href : "#";
        return '<a href="' + safe + '" rel="noreferrer noopener">' + label + "</a>";
      })

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
      bits.push('<span class="chip" title="summarizer model">' + esc(row.summarizerModel || "model unknown") + "</span>");
    }
    if (row.toolName) bits.push(esc(row.toolName));
    if (row.toolCallId) bits.push(esc(String(row.toolCallId).slice(0, 8)));
    if (row.summaryChars != null) bits.push(fmtChars(row.summaryChars) + " sum");
    if (row.linkedTools && row.linkedTools.length) {
      const orig = row.linkedTools.reduce((s, t) => s + (t.originalChars || 0), 0);
      bits.push("orig " + fmtChars(orig));
    }
    return bits.join(" · ");
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

  function renderShell(doc) {
    meta.textContent =
      (doc.sessionLabel || doc.sessionId || "session") +
      " · " +
      new Date(doc.timestamp).toLocaleString() +
      " · " +
      (doc.stats?.messageCount ?? 0) +
      " rows · " +
      (doc.stats?.summaryCount ?? 0) +
      " summaries · pruned " +
      (doc.stats?.prunedToolCount ?? 0);

    const rows = doc.rows || [];
    rowData.clear();
    if (rows.length === 0) {
      list.innerHTML =
        '<div class="empty">No agent-visible messages in this snapshot.<br>' +
        'session: ' + esc(doc.sessionLabel || doc.sessionId || '?') +
        ' · branch entries: ' + String(doc.stats?.branchEntryCount ?? '?') +
        ' · rows: 0<br>' +
        'If branch entries is 0, /pruner tree saw an empty session path (reload pi and retry). ' +
        'If branch &gt; 0 but rows 0, entry parsing failed.</div>';
      return;
    }

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
        '<div class="head" tabindex="0" role="button" aria-expanded="' +
        (isOpen ? "true" : "false") +
        '">' +
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
        "</article>";
    }
    list.innerHTML = parts.join("");

    // Re-hydrate bodies for rows that were open before a snapshot refresh.
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

      meta.textContent = "loading snapshot…";
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
      meta.textContent =
        "offline / failed: " +
        msg +
        " — re-run /pruner tree in pi (do not kill other pi processes)";
      if (!lastKey) {
        list.innerHTML =
          '<div class="empty">Viewer server not reachable.<br>In pi: /pruner tree</div>';
      }
    } finally {
      loading = false;
    }
  }

  function beat() {
    fetch("/api/heartbeat", {
      method: "POST",
      keepalive: true,
      signal: AbortSignal.timeout(3000),
    }).catch(() => {});
  }

  window.addEventListener("pagehide", () => {
    navigator.sendBeacon("/api/bye");
  });

  beat();
  setInterval(beat, 5000);
  load();
  setInterval(load, 2500);
})();
</script>
</body>
</html>
`;
