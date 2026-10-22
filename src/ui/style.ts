/** A faithful recreation of cgit's default stylesheet (cgit.css). */
export const CSS = `
div#cgit {
  padding: 0em;
  margin: 0em;
  font-family: sans-serif;
  font-size: 10pt;
  color: #333;
  background: white;
  padding: 4px;
}
div#cgit a {
  color: blue;
  text-decoration: none;
}
div#cgit a:hover {
  text-decoration: underline;
}
div#cgit table {
  border-collapse: collapse;
}
div#cgit table#header {
  width: 100%;
  margin-bottom: 1em;
}
div#cgit table#header td.logo {
  width: 96px;
  vertical-align: top;
}
div#cgit table#header td.main {
  font-size: 250%;
  padding-left: 10px;
  white-space: nowrap;
}
div#cgit table#header td.main a {
  color: #000;
}
div#cgit table#header td.form {
  text-align: right;
  vertical-align: bottom;
  padding-right: 1em;
  padding-bottom: 2px;
  white-space: nowrap;
}
div#cgit table#header td.sub {
  color: #777;
  border-top: solid 1px #ccc;
  padding-left: 10px;
}
div#cgit table.tabs {
  border-bottom: solid 3px #ccc;
  border-collapse: collapse;
  margin-top: 2em;
  margin-bottom: 0px;
  width: 100%;
}
div#cgit table.tabs td {
  padding: 0px 1em;
  vertical-align: bottom;
}
div#cgit table.tabs td a {
  padding: 2px 0.75em;
  color: #777;
  font-size: 110%;
}
div#cgit table.tabs td a.active {
  color: #000;
  background-color: #ccc;
}
div#cgit table.tabs a[href]:hover {
  text-decoration: none;
}
div#cgit table.tabs td.form {
  text-align: right;
}
div#cgit table.tabs td.form form {
  padding-bottom: 2px;
  font-size: 90%;
  white-space: nowrap;
}
div#cgit div.path {
  margin: 0px;
  padding: 5px 2em 2px 2em;
  color: #000;
  background-color: #eee;
}
div#cgit div.content {
  margin: 0px;
  padding: 2em;
  border-bottom: solid 3px #ccc;
}
div#cgit table.list {
  width: 100%;
  border: none;
  border-collapse: collapse;
}
div#cgit table.list tr {
  background: white;
}
div#cgit table.list tr.logheader {
  background: #eee;
}
div#cgit table.list tr:hover {
  background: #eee;
}
div#cgit table.list tr.nohover, div#cgit table.list tr.nohover:hover {
  background: white;
}
div#cgit table.list th {
  font-weight: bold;
  border-top: dashed 1px #888;
  border-bottom: dashed 1px #888;
  padding: 0.1em 0.5em 0.05em 0.5em;
  vertical-align: baseline;
  text-align: left;
}
div#cgit table.list td {
  border: none;
  padding: 0.1em 0.5em 0.1em 0.5em;
}
div#cgit table.list td.commitgraph {
  font-family: monospace;
  white-space: pre;
}
div#cgit table.list td.logsubject {
  font-family: monospace;
  font-weight: bold;
}
div#cgit table.list td.logmsg {
  font-family: monospace;
  white-space: pre;
  padding: 0 0.5em;
}
div#cgit table.list td a {
  color: black;
}
div#cgit table.list td a.ls-dir {
  font-weight: bold;
  color: #00f;
}
div#cgit table.list td a:hover {
  color: #00f;
}
div#cgit td.ls-size {
  text-align: right;
  font-family: monospace;
  width: 10em;
}
div#cgit td.ls-mode {
  font-family: monospace;
  width: 10em;
}
div#cgit table.blob {
  margin-top: 0.5em;
  border-top: solid 1px black;
}
div#cgit table.blob td.linenumbers {
  margin: 0;
  padding: 0 0 0 0.5em;
  vertical-align: top;
  text-align: right;
  border-right: 1px solid gray;
}
div#cgit table.blob pre {
  padding: 0;
  margin: 0;
}
div#cgit table.blob td.linenumbers a {
  color: gray;
  text-align: right;
  font-family: monospace;
}
div#cgit table.blob td.lines {
  margin: 0;
  padding: 0 0 0 0.5em;
  vertical-align: top;
}
div#cgit table.blob td.lines pre, div#cgit td.lines code {
  font-family: monospace;
}
div#cgit div.footer {
  margin-top: 0.5em;
  text-align: center;
  font-size: 80%;
  color: #ccc;
}
div#cgit div.footer a {
  color: #ccc;
  text-decoration: none;
}
div#cgit div.footer a:hover {
  text-decoration: underline;
}
div#cgit table.commit-info {
  border-collapse: collapse;
  margin-top: 1.5em;
}
div#cgit table.commit-info th {
  text-align: left;
  font-weight: normal;
  padding: 0.1em 1em 0.1em 0.1em;
  vertical-align: top;
}
div#cgit table.commit-info td {
  font-weight: normal;
  padding: 0.1em 1em 0.1em 0.1em;
}
div#cgit div.commit-subject {
  font-weight: bold;
  font-size: 125%;
  margin: 1.5em 0em 0.5em 0em;
  padding: 0em;
}
div#cgit div.commit-msg {
  white-space: pre;
  font-family: monospace;
}
div#cgit div.diffstat-header {
  font-weight: bold;
  padding-top: 1.5em;
}
div#cgit table.diffstat {
  border-collapse: collapse;
  border: solid 1px #aaa;
  background-color: #eee;
}
div#cgit table.diffstat th {
  font-weight: normal;
  text-align: left;
  text-decoration: underline;
  padding: 0.1em 1em 0.1em 0.1em;
  font-size: 100%;
}
div#cgit table.diffstat td {
  padding: 0.2em 0.2em 0.1em 0.1em;
  font-size: 100%;
  border: none;
}
div#cgit table.diffstat td span.modechange {
  padding-left: 1em;
  color: red;
}
div#cgit table.diffstat td.add a {
  color: green;
}
div#cgit table.diffstat td.del a {
  color: red;
}
div#cgit table.diffstat td.graph {
  width: 500px;
  vertical-align: middle;
}
div#cgit table.diffstat td.graph table {
  border: none;
}
div#cgit table.diffstat td.graph td {
  padding: 0px;
  border: 0px;
  height: 7pt;
}
div#cgit table.diffstat td.graph td.add {
  background-color: #5c5;
}
div#cgit table.diffstat td.graph td.rem {
  background-color: #c55;
}
div#cgit div.diffstat-summary {
  color: #888;
  padding-top: 0.5em;
}
div#cgit table.diff {
  width: 100%;
}
div#cgit table.diff td {
  font-family: monospace;
  white-space: pre-wrap;
}
div#cgit table.diff td div.head {
  font-weight: bold;
  margin-top: 1em;
  color: black;
}
div#cgit table.diff td div.hunk {
  color: #009;
}
div#cgit table.diff td div.add {
  color: green;
}
div#cgit table.diff td div.del {
  color: red;
}
div#cgit .sha1 {
  font-family: monospace;
  font-size: 90%;
}
div#cgit .left {
  text-align: left;
}
div#cgit .right {
  text-align: right;
}
div#cgit a.branch-deco {
  color: #000;
  margin: 0px 0.5em;
  padding: 0px 0.25em;
  background-color: #88ff88;
  border: solid 1px #007700;
}
div#cgit a.tag-deco {
  color: #000;
  margin: 0px 0.5em;
  padding: 0px 0.25em;
  background-color: #ffff88;
  border: solid 1px #777700;
}
div#cgit a.deco {
  color: #000;
  margin: 0px 0.5em;
  padding: 0px 0.25em;
  background-color: #ff8888;
  border: solid 1px #770000;
}
div#cgit span.age-mins {
  font-size: 90%;
  color: #080;
}
div#cgit span.age-hours {
  font-size: 90%;
  color: #080;
}
div#cgit span.age-days {
  font-size: 90%;
  color: #040;
}
div#cgit span.age-weeks {
  font-size: 90%;
  color: #444;
}
div#cgit span.age-months {
  font-size: 90%;
  color: #888;
}
div#cgit span.age-years {
  font-size: 90%;
  color: #bbb;
}
div#cgit div.error {
  color: red;
  font-weight: bold;
  margin: 1em 2em;
}
div#cgit table.repolist-clone td {
  padding-right: 1em;
}
div#cgit .clone-url {
  font-family: monospace;
}
div#cgit span.hl-c { color: #888; font-style: italic; }
div#cgit span.hl-s { color: #a11; }
div#cgit span.hl-k { color: #00d; }
div#cgit span.hl-n { color: #099; }
div#cgit table.blame td.sha1 {
  white-space: nowrap;
  vertical-align: top;
  padding-right: 1em;
}
div#cgit table.blame td.lines {
  vertical-align: top;
}
div#cgit table.blame tr:hover {
  background: #eee;
}
div#cgit table.blame pre {
  margin: 0;
  padding: 0;
}
div#cgit div.md h1, div#cgit div.md h2 {
  border-bottom: solid 1px #ccc;
  padding-bottom: 0.2em;
}
div#cgit div.md pre.md-code {
  background: #f4f4f4;
  border: solid 1px #ddd;
  padding: 0.5em;
  overflow-x: auto;
}
div#cgit div.md code {
  background: #f4f4f4;
  padding: 0 0.2em;
}
div#cgit div.md blockquote {
  border-left: solid 3px #ccc;
  margin-left: 0;
  padding-left: 1em;
  color: #666;
}
div#cgit div.md img {
  max-width: 100%;
}
div#cgit div.md table {
  border-collapse: collapse;
  margin: 0.5em 0;
}
div#cgit div.md table th, div#cgit div.md table td {
  border: solid 1px #ccc;
  padding: 0.3em 0.6em;
}
div#cgit div.md table th {
  background: #f4f4f4;
}
div#cgit div.md li.task {
  list-style: none;
  margin-left: -1.2em;
}
div#cgit div.md li.task input {
  margin-right: 0.4em;
}
div#cgit table.stats th {
  text-align: left;
  padding: 0.1em 0.5em;
  border-top: dashed 1px #888;
  border-bottom: dashed 1px #888;
}
div#cgit table.stats td {
  text-align: right;
  padding: 0.1em 0.5em;
}
div#cgit table.stats td.name {
  text-align: left;
}
div#cgit table.list td.snapshots a {
  margin-right: 0.5em;
}
div#cgit form select, div#cgit form input {
  font-size: 90%;
}
/* small screens: keep the cgit look but shrink the chrome, let the tabs
   wrap, and scroll wide tables inside their own box instead of the page */
@media (max-width: 700px) {
  div#cgit table#header td.main {
    font-size: 150%;
    white-space: normal;
    padding-left: 4px;
  }
  div#cgit table#header td.sub {
    padding-left: 4px;
  }
  div#cgit table.tabs, div#cgit table.tabs tr, div#cgit table.tabs td {
    display: block;
  }
  div#cgit table.tabs {
    margin-top: 1em;
  }
  div#cgit table.tabs td {
    padding: 0 0.25em;
  }
  div#cgit table.tabs td a {
    display: inline-block;
    padding: 3px 0.6em;
  }
  div#cgit table.tabs td.form {
    text-align: left;
    padding: 3px 0.6em;
  }
  div#cgit div.path {
    padding: 5px 0.75em 2px 0.75em;
  }
  div#cgit div.content {
    padding: 1em 0.75em;
  }
  div#cgit table.list, div#cgit table.blob, div#cgit table.blame,
  div#cgit table.commit-info, div#cgit table.stats {
    display: block;
    overflow-x: auto;
  }
  div#cgit div.commit-msg {
    overflow-x: auto;
  }
  div#cgit td.ls-mode, div#cgit td.ls-size {
    width: auto;
  }
  div#cgit form input[type='text'] {
    width: 8em;
  }
}

/* ---- modern theme override (Hark) ---- */
:root{--bg:#f6f8fa;--card:#fff;--fg:#1f2328;--muted:#656d76;--line:#d0d7de;--accent:#0969da;--hover:#f3f6f9;--code:#f6f8fa}
@media (prefers-color-scheme: dark){:root{--bg:#0d1117;--card:#161b22;--fg:#e6edf3;--muted:#8d96a0;--line:#30363d;--accent:#4493f8;--hover:#1c2129;--code:#0d1117}}
html,body{margin:0;background:var(--bg)}
div#cgit{max-width:1100px;margin:0 auto;padding:24px 20px 48px;font:14px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;color:var(--fg);background:transparent}
div#cgit a{color:var(--accent)}
div#cgit table#header{margin-bottom:8px}
div#cgit table#header td.main{font-size:22px;font-weight:600;padding-left:0}
div#cgit table#header td.main a{color:var(--fg)}
div#cgit table#header td.sub{border:none;color:var(--muted);padding-left:0;font-size:14px}
div#cgit table.tabs{border-bottom:1px solid var(--line);margin-top:12px}
div#cgit table.tabs td{padding:0}
div#cgit table.tabs td a{display:inline-block;padding:8px 14px;color:var(--muted);font-size:14px;border-bottom:2px solid transparent;margin-bottom:-1px}
div#cgit table.tabs td a:hover{color:var(--fg);text-decoration:none}
div#cgit table.tabs td a.active{background:none;color:var(--fg);font-weight:600;border-bottom-color:#fd8c73}
div#cgit select,div#cgit input{background:var(--card);color:var(--fg);border:1px solid var(--line);border-radius:6px;padding:4px 8px;font:inherit}
div#cgit div.path{background:none;padding:14px 0 6px;font-weight:600}
div#cgit div.content{margin-top:14px;padding:0;border:1px solid var(--line);border-radius:8px;background:var(--card);overflow:auto}
div#cgit table.list{width:100%}
div#cgit table.list tr,div#cgit table.list tr.nohover,div#cgit table.list tr.nohover:hover{background:transparent}
div#cgit table.list tr:hover{background:var(--hover)}
div#cgit table.list tr.logheader{background:var(--bg)}
div#cgit table.list th{border:none;border-bottom:1px solid var(--line);background:var(--bg);color:var(--muted);font-weight:600;padding:10px 16px}
div#cgit table.list td{border-top:1px solid var(--line);padding:9px 16px}
div#cgit table.list td a{color:var(--fg)}
div#cgit table.list td a:hover{color:var(--accent)}
div#cgit table.list td a.ls-dir{color:var(--fg);font-weight:600}
div#cgit table.list td a.ls-dir::before{content:"📁 "}
div#cgit table.list td.logsubject{font-family:inherit;font-weight:500}
div#cgit table.list:has(td.ls-mode) tr > :first-child{display:none}
div#cgit td.ls-size{font-family:inherit;color:var(--muted);width:6em}
div#cgit table.list:has(td.ls-mode) td:last-child a{color:var(--muted);font-size:12px;margin-right:6px}
div#cgit table.list:has(td.ls-mode) td:last-child{text-align:right;width:12em}
div#cgit div.content > *:not(table){margin-left:16px;margin-right:16px}
div#cgit table.blob,div#cgit table.diff,div#cgit table.blame{border:none;background:var(--code);width:100%}
div#cgit pre,div#cgit code,div#cgit table.blob td{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12.5px}
div#cgit div.footer{border:none;color:var(--muted);text-align:center;margin-top:24px;font-size:12px}
div#cgit div.md{padding:8px 24px;line-height:1.7}
div#cgit div.md pre{background:var(--code);border:1px solid var(--line);border-radius:6px;padding:12px;overflow:auto}

div#cgit div.content:has(> .gh){border:none;background:none;overflow:visible}
div#cgit div.content > .gh{margin:0}
div#cgit .gh-top{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin:0 0 12px}
div#cgit .gh-meta{color:var(--muted)} div#cgit .gh-meta a{color:var(--fg);font-weight:500}
div#cgit .gh-clone{display:flex;align-items:center;gap:8px;color:var(--muted)}
div#cgit .gh-clone input{width:min(360px,70vw);font-family:ui-monospace,Menlo,monospace;font-size:12px}
div#cgit .gh-card{border:1px solid var(--line);border-radius:8px;background:var(--card);margin:0 0 16px;overflow:hidden}
div#cgit .gh-card-h{padding:10px 16px;background:var(--bg);border-bottom:1px solid var(--line);font-weight:600}
div#cgit .gh-commit{font-weight:400;display:flex;gap:8px;align-items:center}
div#cgit .gh-commit a{color:var(--muted)} div#cgit .gh-age{margin-left:auto;color:var(--muted);font-size:12px}
div#cgit table.gh-files tr:first-child td{border-top:none}
div#cgit td.gh-size{text-align:right;color:var(--muted);width:8em}
div#cgit .gh-readme div.md{padding:8px 32px 24px}
div#cgit .gh-readme div.md h1{border-bottom:1px solid var(--line);padding-bottom:.3em}
div#cgit .gh-pre{padding:16px;margin:0}

div#cgit div.md pre,div#cgit div.md code,div#cgit div.md pre code{background:var(--code)!important;color:var(--fg)!important}
div#cgit div.md :not(pre)>code{padding:.15em .35em;border-radius:4px;border:1px solid var(--line)}
`;
