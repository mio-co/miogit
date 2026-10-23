import { UI_VER } from "./mio";
import { ICON_ARROW_LEFT, ICON_CARET_DOWN, ICON_CHECK, ICON_CODE, ICON_GIT_BRANCH, ICON_HISTORY, ICON_REPO, ICON_WARNING } from "./icons";
const ESCAPES: Record<string, string> = {
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "`": "&#96;",
};

export function esc(s: string): string {
  return s.replace(/[&<>"'`]/g, (c) => ESCAPES[c]);
}

/** repo name as a URL path — a namespaced name's slash stays a separator */
export function repoUrl(repo: string): string {
  return repo.split("/").map(encodeURIComponent).join("/");
}

/** repo name as a filename stem: the last segment of a namespaced name */
export function repoBase(repo: string): string {
  return repo.slice(repo.lastIndexOf("/") + 1);
}

/** cgit-style relative age with its color class, e.g. "3 days" / age-days. */
export function age(unixSecs: number): string {
  if (!unixSecs) return "";
  const secs = Math.max(0, Math.floor(Date.now() / 1000) - unixSecs);
  const fmt = (n: number, unit: string, cls: string) =>
    `<span class='age-${cls}'>${n} ${unit}${n === 1 ? "" : unit.endsWith(".") ? "" : "s"}</span>`;
  if (secs < 3600) return fmt(Math.max(1, Math.floor(secs / 60)), "min.", "mins");
  if (secs < 24 * 3600) return fmt(Math.floor(secs / 3600), "hour", "hours");
  if (secs < 7 * 24 * 3600) return fmt(Math.floor(secs / (24 * 3600)), "day", "days");
  if (secs < 31 * 24 * 3600) return fmt(Math.floor(secs / (7 * 24 * 3600)), "week", "weeks");
  if (secs < 365 * 24 * 3600) return fmt(Math.floor(secs / (30 * 24 * 3600)), "month", "months");
  return fmt(Math.floor(secs / (365 * 24 * 3600)), "year", "years");
}

export function fmtDate(unixSecs: number, tz: string): string {
  const d = new Date(unixSecs * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} ${tz}`
  );
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** RFC 2822 date in the person's own timezone (for patch/atom output). */
export function fmtDate2822(unixSecs: number, tz: string): string {
  const offMin = (parseInt(tz.slice(0, 3), 10) || 0) * 60 + (parseInt(tz.slice(0, 1) + tz.slice(3), 10) || 0);
  const d = new Date((unixSecs + offMin * 60) * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${DAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} ${tz}`
  );
}

export interface LayoutOpts {
  site: string;
  siteDesc: string;
  title: string;
  /** repo name when rendering a repo page */
  repo?: string;
  /** repository description (shown once, in the About card of the Code page) */
  sub: string;
  /** rendered after <main>, outside every transformed container (modal dialogs) */
  overlay?: string;
  /** active tab id */
  tab?: string;
  /** current ref for tab links */
  ref?: string;
  /** the repository's default branch (Code tab goes to the overview when ref is the default) */
  headRef?: string;
  /** breadcrumb path html (tree pages) */
  pathBar?: string;
  /** legacy flag (README now lives on the Code page only) */
  hasAbout?: boolean;
  /** branch names for the switcher dropdown */
  branches?: string[];
  /** target path of the branch switcher (current page path); each branch links to it with ?h= */
  formAction?: string;
  /** show the branch switcher row (default: on Code / Commits / Stats pages) */
  switcher?: boolean;
  /** extra items after the switcher in the branch row (e.g. branch/tag counts) */
  refExtra?: string;
  /** right-aligned actions in the branch row (e.g. the Clone menu) */
  refActions?: string;
  /** non-repo pages: page heading (trusted HTML) instead of "Repositories", optional sub line and right-aligned actions */
  heading?: { title: string; sub?: string; actions?: string };
  body: string;
}

const ICON_SUN = `<svg viewBox='0 0 256 256' aria-hidden='true'><circle cx='128' cy='128' r='48' fill='none' stroke='currentColor' stroke-width='16'/><path d='M128 24v20M128 212v20M54.5 54.5l14.1 14.1M187.4 187.4l14.1 14.1M24 128h20M212 128h20M54.5 201.5l14.1-14.1M187.4 68.6l14.1-14.1' stroke='currentColor' stroke-width='16' stroke-linecap='round'/></svg>`;
const ICON_MOON = `<svg viewBox='0 0 256 256' aria-hidden='true'><path d='M216.7 152.6A91.9 91.9 0 0 1 103.4 39.3a92 92 0 1 0 113.3 113.3Z' fill='none' stroke='currentColor' stroke-width='16' stroke-linejoin='round'/></svg>`;
const ICON_AUTO = `<svg viewBox='0 0 256 256' aria-hidden='true'><rect x='32' y='48' width='192' height='136' rx='12' fill='none' stroke='currentColor' stroke-width='16'/><path d='M96 216h64M128 184v32' stroke='currentColor' stroke-width='16' stroke-linecap='round'/></svg>`;

/** bilingual inline text: English in the HTML, Chinese swapped in client-side */
export function t(en: string, zh: string): string {
  return `<span data-zh='${esc(zh)}'>${esc(en)}</span>`;
}

/** which tab a page id belongs to (GitHub repository tabs) */
const TAB_OF: Record<string, string> = {
  summary: "code", tree: "code", about: "code", code: "code",
  log: "log", commit: "log", diff: "log",
  refs: "branches", branches: "branches",
  tags: "branches", tag: "branches",
  stats: "code",
};

/** MioUI Breadcrumb: repo root / dir / … / current (current is plain text, aria-current) */
export function breadcrumb(items: { label: string; href?: string; html?: boolean }[]): string {
  const sep = `<li class='mio-bc-sep' role='presentation' aria-hidden='true'>/</li>`;
  return `<nav class='mio-bc' aria-label='Breadcrumb'><ol>` +
    items.map((it, i) => {
      const last = i === items.length - 1;
      const label = it.html ? it.label : esc(it.label);
      const inner = last || !it.href
        ? `<span${last ? " aria-current='page'" : ""}>${label}</span>`
        : `<a href='${it.href}'>${label}</a>`;
      return (i ? sep : "") + `<li>${inner}</li>`;
    }).join("") +
    `</ol></nav>`;
}

export function layout(o: LayoutOpts): string {
  const r = o.repo ? `/${repoUrl(o.repo)}` : "";
  const q = o.ref ? `?h=${encodeURIComponent(o.ref)}` : "";
  const onDefault = !o.ref || !o.headRef || o.ref === o.headRef;
  const tabs: [string, string, string, string][] = o.repo
    ? [
        ["code", onDefault ? `${r}/` : `${r}/tree/${q}`, ICON_CODE, t("Code", "代码")],
        ["log", `${r}/log/${q}`, ICON_HISTORY, t("Commits", "提交")],
        ["branches", `${r}/branches/`, ICON_GIT_BRANCH, t("Branches", "分支")],
      ]
    : [];
  const activeTab = TAB_OF[o.tab ?? ""] ?? o.tab;
  const tabHtml = tabs
    .map(([id, href, icon, label]) => `<a${id === activeTab ? " class='active' aria-current='page'" : ""} href='${href}'>${icon}${label}</a>`)
    .join("");
  // GitHub-style branch picker: a button (GitBranch + name + caret) opening a
  // menu of links (?h=<branch>); <details> needs no script, app.js only adds
  // outside-click / Escape closing
  const wantSwitcher = o.switcher ?? (activeTab === "code" || activeTab === "log");
  const hasSwitcher = !!(o.repo && wantSwitcher && o.branches && o.branches.length > 0);
  const target = esc(o.formAction ?? `${r}/`);
  const switcher = hasSwitcher
    ? `<details class='mio-menu mio-ref' data-menu>` +
      `<summary class='mio-menu-btn' aria-label='Switch branch' data-zh-title='切换分支' title='Switch branch'>${ICON_GIT_BRANCH}<span class='mio-ref-name' data-noi18n>${esc(o.ref ?? "")}</span>${ICON_CARET_DOWN}</summary>` +
      `<div class='mio-menu-pop' role='menu'>` +
      `<div class='mio-menu-h'>${t("Switch branch", "切换分支")}</div>` +
      o.branches!
        .map((b) => `<a role='menuitemradio' aria-checked='${b === o.ref}' href='${target}?h=${encodeURIComponent(b)}' data-noi18n>${ICON_CHECK}<span>${esc(b)}</span></a>`)
        .join("") +
      `</div></details>`
    : "";
  const atom = o.repo
    ? `<link rel='alternate' title='Atom feed' href='${r}/atom/${q}' type='application/atom+xml'/>`
    : "";
  const head = o.tab === "login" ? "" : o.repo
    ? `<div class='mio-head mio-repo-head'><span class='mio-head-ico'>${ICON_REPO}</span><h1><a href='${r}/'>${esc(o.repo)}</a></h1></div>`
    : o.heading
      ? `<div class='mio-head'><h1>${o.heading.title}</h1>${o.heading.actions ? `<div class='mio-head-act'>${o.heading.actions}</div>` : ""}</div>` +
        (o.heading.sub ? `<p class='mio-sub'>${o.heading.sub}</p>` : "")
      : `<div class='mio-head'><h1>${t("Repositories", "仓库")}</h1></div>` +
        (o.siteDesc || o.sub ? `<p class='mio-sub'>${esc(o.siteDesc || o.sub)}</p>` : "");
  // GitHub code-page row: branch picker first, then counts / breadcrumb, actions on the right.
  // It sits at the top of the content (a page may place it with the <!--gh-bar--> marker).
  const bar = switcher || o.pathBar || o.refExtra || o.refActions
    ? `<div class='gh-bar'>${switcher}${o.refExtra ?? ""}${o.pathBar ? `<div class='path'>${o.pathBar}</div>` : ""}${o.refActions ? `<div class='gh-bar-act'>${o.refActions}</div>` : ""}</div>`
    : "";
  const body = o.body.includes("<!--gh-bar-->") ? o.body.replace("<!--gh-bar-->", bar) : bar + o.body;
  return `<!DOCTYPE html>
<html lang='en' data-accent='clay'>
<head>
<meta charset='utf-8'/>
<title>${esc(o.title)}</title>
<meta name='generator' content='MioGit'/>
<meta name='viewport' content='width=device-width, initial-scale=1'/>
<meta name='color-scheme' content='light dark'/>
<script src='/app.js?v=${UI_VER}'></script>
<link rel='icon' type='image/svg+xml' href='/favicon.svg'/>
<link rel='stylesheet' type='text/css' href='/cgit.css?v=${UI_VER}'/>
${atom}
</head>
<body>
<header class='mio-top'><div class='mio-wrap'>
<a class='mio-brand' href='/'><svg class='mio-logo' viewBox='0 0 64 64' aria-hidden='true'><path d='M8 50V15l18 19 18-19v35' fill='none' stroke='currentColor' stroke-width='7.5' stroke-linecap='round' stroke-linejoin='round'/><circle cx='56.5' cy='50' r='5' fill='currentColor' class='mio-logo-dot'/></svg><span class='site'>${esc(o.site)}</span></a>
<div class='mio-actions'>
<span id='mh-auth'></span>
<div class='mio-seg' role='group' aria-label='Language'><button type='button' data-set-lang='zh'>中</button><button type='button' data-set-lang='en'>EN</button></div>
<div class='mio-seg' role='group' aria-label='Theme'><button type='button' data-set-theme='light' title='Light' aria-label='Light' data-zh-title='浅色'>${ICON_SUN}</button><button type='button' data-set-theme='system' title='System' aria-label='System' data-zh-title='跟随系统'>${ICON_AUTO}</button><button type='button' data-set-theme='dark' title='Dark' aria-label='Dark' data-zh-title='深色'>${ICON_MOON}</button></div>
</div>
</div></header>
<main id='cgit'${o.repo ? " class='is-repo'" : ""}>
${head}
${tabHtml ? `<nav class='mio-tabs'>${tabHtml}</nav>` : ""}
<div class='content'>
${body}
</div>
</main>
<footer class='mio-foot'><div class='mio-wrap mio-foot-in'><div class='mio-copy'>&copy; ${new Date().getUTCFullYear()} Mio</div><nav class='mio-friends' aria-label='Friends'><a href='https://mio.300031.xyz' target='_blank' rel='noopener'>MioCore</a><a href='https://overlord.300031.xyz/#top' target='_blank' rel='noopener'>OVERLORD</a><a href='https://cee.edu.pl' target='_blank' rel='noopener'>CeeMail</a><a href='https://nats.300031.xyz/' target='_blank' rel='noopener'>Amaeru Connect</a></nav></div></footer>
${o.overlay ?? ""}
</body>
</html>
`;
}

/** MioUI EmptyState: icon, title, description, optional action (all trusted HTML) */
export function emptyState(o: { icon?: string; title: string; desc?: string; action?: string; extra?: string; bare?: boolean }): string {
  return `<div class='mio-empty${o.bare ? " is-bare" : ""}'>` +
    (o.icon ? `<div class='mio-empty-ico'>${o.icon}</div>` : "") +
    `<h3>${o.title}</h3>` +
    (o.desc ? `<p>${o.desc}</p>` : "") +
    (o.extra ?? "") +
    (o.action ? `<div class='mio-empty-act'>${o.action}</div>` : "") +
    `</div>`;
}

export const CSP =
  "default-src 'none'; script-src 'self'; connect-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'";

export function htmlResponse(html: string, status = 200): Response {
  return new Response(html, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-cache",
      "content-security-policy": CSP,
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      "x-frame-options": "DENY",
    },
  });
}

/** error / not-found page: MioUI Result-style empty state with a way back */
export function errorPage(o: Omit<LayoutOpts, "body">, msg: string, status = 404): Response {
  const back = o.repo
    ? `<a class='mio-btn mio-btn-secondary mio-btn-md' href='/${repoUrl(o.repo)}/'>${ICON_ARROW_LEFT}${t("Back to repository", "返回仓库")}</a>`
    : `<a class='mio-btn mio-btn-secondary mio-btn-md' href='/'>${ICON_ARROW_LEFT}${t("All repositories", "全部仓库")}</a>`;
  const title = status === 404 ? t("Not found", "没有找到") : status === 403 ? t("Access denied", "没有权限") : t("Something went wrong", "出错了");
  const body = emptyState({ icon: ICON_WARNING, title, desc: `<span class='error' data-noi18n>${esc(msg)}</span>`, action: back });
  return htmlResponse(layout({ ...o, switcher: false, body }), status);
}
