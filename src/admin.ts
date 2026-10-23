/**
 * The web console under /~mio/ — sign-in, token management, password change,
 * repository settings and the web editor. One Cloudflare Access application
 * on "<host>/~mio/" covers all of it; every request here is additionally
 * checked against the Access JWT inside the Worker (fail closed), then against
 * the console session (username + PBKDF2 password, cookie Path=/~mio/,
 * SameSite=Strict), and every state change carries a CSRF token plus an
 * Origin check.
 *
 * "~" can never start a repository name, so nothing here can shadow a repo.
 */
import type { Env } from "./env";
import type { RepoInfo, TokenRow } from "./registry";
import { esc, repoUrl, layout, htmlResponse, t, type LayoutOpts } from "./ui/html";
import {
  adminPasswordHash,
  adminUser,
  clearSessionCookie,
  clearHintCookie,
  csrfToken,
  hasHint,
  hintCookie,
  csrfValid,
  hashPassword,
  makeSession,
  newTokenId,
  newTokenSecret,
  sameOrigin,
  secretsEqual,
  sessionCookie,
  REMEMBER_TTL_S,
  SESSION_TTL_S,
  sessionSecondsLeft,
  sha256Hex,
  validSession,
  verifyAccess,
  verifyPassword,
} from "./auth";
import { isRole, type Role } from "./policy";
import { ICON_COPY, ICON_PENCIL, ICON_X, ICON_CARET_DOWN, ICON_GEAR_SIX, ICON_GLOBE, ICON_KEY, ICON_LOCK_KEY, ICON_SIGN_OUT, ICON_SLIDERS, ICON_USER_CIRCLE, ICON_WARNING } from "./ui/icons";

export const CONSOLE = "/~mio";

export interface ConsoleDeps {
  movedTab: (sub: string) => string | null;
  siteBase: (env: Env) => { site: string; siteDesc: string; title: string; sub: string; tab: string };
  /** the repository list, signed-in flavour (stats, private repos), with optional per-row settings links */
  indexBody: (env: Env, signedIn: boolean, settings?: boolean) => Promise<string>;
  /** tell the Worker's per-isolate registry memo (and, with an origin, the edge index cache) that a repo changed */
  invalidate: (repo: string, origin?: string) => unknown;
}

const REPO_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const LOCK = `<svg viewBox='0 0 256 256' aria-hidden='true'><rect x='40' y='88' width='176' height='128' rx='8' fill='none' stroke='currentColor' stroke-width='16'/><path d='M88 88V56a40 40 0 0 1 80 0v32' fill='none' stroke='currentColor' stroke-width='16' stroke-linecap='round'/></svg>`;

const ROLE_LABEL: Record<Role, [string, string]> = {
  admin: ["Admin", "管理员"],
  writer: ["Writer", "写入"],
  reader: ["Reader", "只读"],
};

function noStore(res: Response): Response {
  res.headers.set("cache-control", "no-store");
  return res;
}

function redirect(to: string, ...cookies: string[]): Response {
  const h = new Headers({ location: to, "cache-control": "no-store" });
  for (const c of cookies) h.append("set-cookie", c);
  return new Response(null, { status: 303, headers: h });
}

function text(msg: string, status: number): Response {
  return noStore(new Response(msg.endsWith("\n") ? msg : msg + "\n", { status, headers: { "content-type": "text/plain; charset=utf-8" } }));
}

/** Only console paths are acceptable post-login destinations; anything else lands on the console home. */
export function safeNext(n: string | null): string {
  return n && n.startsWith(`${CONSOLE}/`) && !n.startsWith("//") && !n.includes("\\") && !/[\x00-\x1f]/.test(n) ? n : `${CONSOLE}/`;
}

function clientIp(req: Request): string {
  return req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

function fmtTime(ms: number): string {
  if (!ms) return "—";
  return new Date(ms).toISOString().slice(0, 16).replace("T", " ");
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** token lifetimes offered when creating one (GitHub fine-grained token style); default 30 days */
const EXPIRY_CHOICES: [string, number, string, string][] = [
  ["7", 7, "7 days", "7 天"],
  ["30", 30, "30 days", "30 天"],
  ["90", 90, "90 days", "90 天"],
  ["365", 365, "1 year", "1 年"],
  ["never", 0, "No expiration", "永不过期"],
];
const EXPIRY_DEFAULT = "30";

/**
 * Form value -> expires_at (unix ms, 0 = never). A missing field (an older
 * client posting without it) means never, like every token from before expiry
 * existed; "test" only exists when TEST_TOKEN_TTL_MS is set (e2e). undefined = invalid.
 */
export function expiryFromForm(v: string | null, env: Env, now = Date.now()): number | undefined {
  if (v === null || v === "" || v === "never") return 0;
  const testTtl = parseInt(env.TEST_TOKEN_TTL_MS ?? "", 10);
  if (v === "test" && testTtl > 0) return now + testTtl;
  const c = EXPIRY_CHOICES.find(([id]) => id === v);
  return c && c[1] > 0 ? now + c[1] * DAY_MS : undefined;
}

function fmtDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** expiry cell: date, "never", or a red "Expired" badge */
function expiryHtml(r: TokenRow, now: number): string {
  if (!r.expires_at) return t("Never", "永不过期");
  if (now >= r.expires_at) return `<span class='tk-exp is-expired' title='${fmtTime(r.expires_at)} UTC'>${t("Expired", "已过期")}</span>`;
  return `<span title='${fmtTime(r.expires_at)} UTC'>${fmtDay(r.expires_at)}</span>`;
}

interface DialogOpts {
  icon?: string;
  title: string;
  desc?: string;
  body: string;
  /** footer actions (right-aligned; stacked full-width on phones) */
  footer?: string;
  cancel: string;
  /** MioUI Dialog widths: sm 400 · md 520 (default) · lg 720 */
  size?: "sm" | "md" | "lg";
  /** render the dialog itself as this form (action) */
  formAction?: string;
  danger?: boolean;
  /** false: a tap on the backdrop does nothing (only the × closes), for forms you would hate to lose */
  backdropCloses?: boolean;
}

/**
 * MioUI Dialog: 16px radius, popover shadow, blurred backdrop; header (title +
 * description) with a close button, a body that scrolls inside the dialog's
 * height cap, and a footer. Works without script: the backdrop and the close
 * button are links back to the page underneath (app.js adds Escape + focus trap).
 */
function dialog(o: DialogOpts): string {
  const tag = o.formAction ? "form" : "div";
  const formAttrs = o.formAction ? ` method='post' action='${esc(o.formAction)}'` : "";
  return `
<div class='mio-dialog-layer' data-dialog-layer>
${o.backdropCloses === false ? `<div class='mio-backdrop' aria-hidden='true'></div>` : `<a class='mio-backdrop' href='${esc(o.cancel)}' tabindex='-1' aria-hidden='true'></a>`}
<${tag} class='mio-dialog mio-dialog-${o.size ?? "md"}' role='dialog' aria-modal='true' aria-labelledby='dlg-t'${o.desc ? " aria-describedby='dlg-d'" : ""}${formAttrs} data-cancel='${esc(o.cancel)}'>
  <div class='mio-dialog-h'>
    ${o.icon ? `<div class='mio-dialog-icon${o.danger ? " is-danger" : ""}'>${o.icon}</div>` : ""}
    <h2 id='dlg-t'>${o.title}</h2>
    ${o.desc ? `<p id='dlg-d'>${o.desc}</p>` : ""}
  </div>
  <a class='mio-btn mio-btn-ghost mio-btn-icon mio-dialog-x' href='${esc(o.cancel)}' data-dialog-cancel title='Close' data-zh-title='关闭' aria-label='Close'>${ICON_X}</a>
  <div class='mio-dialog-b' data-cds-scroll-fade='vertical'>
  ${o.body}
  </div>
  ${o.footer ? `<div class='mio-dialog-f'>${o.footer}</div>` : ""}
</${tag}>
</div>`;
}

/** where an account dialog returns to: the page it was opened from (never another account dialog) */
function dialogNext(n: string | null): string {
  const v = safeNext(n);
  return /^\/~mio\/(tokens|password|login|logout)(\/|\?|$)/.test(v) ? `${CONSOLE}/` : v;
}

export function createConsole(deps: ConsoleDeps) {
  /** console page = the signed-in repository list behind, the dialog in front */
  async function page(env: Env, overlay: string, status = 200, behindSignedIn = true): Promise<Response> {
    const behind = `<div class='mio-behind' inert aria-hidden='true'>${await deps.indexBody(env, behindSignedIn).catch(() => "")}</div>`;
    return noStore(htmlResponse(layout({ ...deps.siteBase(env), tab: "login-bg", body: behind, overlay }), status));
  }

  async function home(env: Env, notice = ""): Promise<Response> {
    const body = (notice ? `<div class='mio-dialog-ok ad-notice' role='status'>${notice}</div>` : "") + (await deps.indexBody(env, true, true));
    const heading = {
      title: t("Repositories", "仓库"),
      sub: deps.siteBase(env).siteDesc ? esc(deps.siteBase(env).siteDesc) : undefined,
    };
    return noStore(htmlResponse(layout({ ...deps.siteBase(env), title: `${deps.siteBase(env).site} · console`, heading, body })));
  }

  /**
   * Top-bar account menu on every signed-in console page (GitHub's avatar menu,
   * kept small): who is signed in, Repositories, Access tokens, Change password,
   * Sign out. A <details> menu, no script needed; app.js adds outside-click / Escape.
   */
  function accountMenu(env: Env, csrf: string, next: string): string {
    const nq = `?next=${encodeURIComponent(next)}`;
    const user = esc(adminUser(env));
    return (
      `<details class='mio-menu mio-acct' data-menu>` +
      `<summary class='mio-menu-btn mio-acct-btn' title='Account' data-zh-title='账户' aria-label='Account'>${ICON_USER_CIRCLE}<span class='mio-acct-l' data-noi18n>${user}</span>${ICON_CARET_DOWN}</summary>` +
      `<div class='mio-menu-pop' role='menu'>` +
      `<div class='mio-menu-h'>${t("Signed in as", "已登录：")} <b data-noi18n>${user}</b></div>` +
      `<div class='mio-menu-sep' role='separator'></div>` +
      `<a role='menuitem' href='${CONSOLE}/tokens${nq}'>${ICON_KEY}${t("Access tokens", "访问令牌")}</a>` +
      `<a role='menuitem' href='${CONSOLE}/password${nq}'>${ICON_LOCK_KEY}${t("Change password", "修改密码")}</a>` +
      `<div class='mio-menu-sep' role='separator'></div>` +
      `<form method='post' action='${CONSOLE}/logout'><input type='hidden' name='csrf' value='${esc(csrf)}'/><button type='submit' role='menuitem'>${ICON_SIGN_OUT}${t("Sign out", "退出")}</button></form>` +
      `</div></details>`
    );
  }

  async function loginPage(env: Env, next: string, error = "", user = "", remember = true): Promise<Response> {
    const body = `
  ${error ? `<div class='mio-dialog-err' role='alert'>${error}</div>` : ""}
  <input type='hidden' name='next' value='${esc(next)}'/>
  <label class='mio-field'><span>${t("Username", "用户名")}</span><input type='text' name='username' value='${esc(user)}' autocomplete='username' autocapitalize='off' spellcheck='false' required${user ? "" : " autofocus"}/></label>
  <label class='mio-field'><span>${t("Password", "密码")}</span><input type='password' name='password' autocomplete='current-password' required${user ? " autofocus" : ""}${error ? " aria-invalid='true'" : ""}/></label>
  <label class='mio-check lg-remember'><input type='checkbox' name='remember' value='1'${remember ? " checked" : ""}/><span>${t("Keep me signed in for 30 days", "记住我（30 天内免登录）")}</span></label>
  <button type='submit' class='mio-btn mio-btn-primary mio-btn-lg lg-submit'>${t("Sign in", "登录")}</button>
`;
    const footer = "";
    return page(
      env,
      dialog({
        icon: LOCK,
        title: t("Sign in to the MioGit console", "登录 MioGit 管理台"),
        desc: t("Use the console account. Git access tokens cannot sign in here.", "使用管理台账号登录。git 访问令牌不能用于登录网页。"),
        body,
        footer,
        size: "sm",
        cancel: "/",
        backdropCloses: false,
        formAction: `${CONSOLE}/login`,
      }),
      error ? 401 : 200,
      false
    );
  }

  /**
   * Account dialogs (Access tokens, Change password) open over the page they
   * were opened from: that page is rendered again behind the dialog (inert),
   * and closing the dialog goes back to it. No script needed.
   */
  async function overPage(req: Request, env: Env, next: string, overlay: string, status = 200): Promise<Response> {
    let res: Response | null = null;
    try {
      const behind = await route(new Request(new URL(next, req.url).toString(), { method: "GET", headers: req.headers }), env);
      if (behind.status === 200 && (behind.headers.get("content-type") ?? "").startsWith("text/html") && typeof HTMLRewriter !== "undefined") res = behind;
    } catch {
      res = null;
    }
    if (!res) return page(env, overlay, status);
    const out = new HTMLRewriter()
      .on("main#cgit", { element(e) { e.setAttribute("inert", ""); e.setAttribute("aria-hidden", "true"); } })
      .on("body", { element(e) { e.append(overlay, { html: true }); } })
      .transform(res);
    return noStore(new Response(out.body, { status, headers: out.headers }));
  }

  async function tokensDialog(req: Request, env: Env, csrf: string, next: string, opts: { error?: string; created?: { row: TokenRow; secret: string }; revoke?: TokenRow } = {}): Promise<Response> {
    const registry = env.REGISTRY.getByName("registry");
    const now = Date.now();
    const nextIn = `<input type='hidden' name='next' value='${esc(next)}'/>`;
    const csrfIn = `<input type='hidden' name='csrf' value='${esc(csrf)}'/>` + nextIn;
    const self = `${CONSOLE}/tokens?next=${encodeURIComponent(next)}`;
    if (opts.revoke) {
      const row = opts.revoke;
      return overPage(req, env, next, dialog({
        icon: ICON_WARNING,
        danger: true,
        size: "sm",
        title: t(`Revoke “${row.name}”?`, `吊销「${row.name}」？`),
        desc: t("Every git request with this token fails from now on. This cannot be undone; create a new token instead.", "之后所有使用这个令牌的 git 请求都会失败。不能撤销，需要时请新建令牌。"),
        body: csrfIn,
        footer: `<a class='mio-btn mio-btn-secondary mio-btn-md' href='${esc(self)}'>${t("Cancel", "取消")}</a>
    <button type='submit' class='mio-btn mio-btn-danger-solid mio-btn-md'>${t("Revoke", "吊销")}</button>`,
        cancel: self,
        formAction: `${CONSOLE}/tokens/${encodeURIComponent(row.id)}/revoke`,
      }));
    }
    let reveal = "";
    if (opts.created) {
      const { row, secret } = opts.created;
      const exp = row.expires_at ? t(`Expires ${fmtDay(row.expires_at)}.`, `到期：${fmtDay(row.expires_at)}。`) : t("Never expires.", "永不过期。");
      reveal = `<section class='dlg-sec tk-reveal' role='status'>
  <h3>${t("Copy your new token", "复制新令牌")}</h3>
  <p class='mio-note'>${t(`Token “${row.name}” (${ROLE_LABEL[row.role][0]}) created.`, `已创建令牌「${row.name}」（${ROLE_LABEL[row.role][1]}）。`)} ${exp} ${t("It will not be shown again.", "离开后不会再显示。")}</p>
  <span class='tk-secret'><input type='text' readonly value='${esc(secret)}' aria-label='token' autocomplete='off' spellcheck='false' data-noi18n/><button type='button' class='mio-btn mio-btn-secondary mio-btn-md' data-copy='${esc(secret)}'>${ICON_COPY}${t("Copy", "复制")}</button></span>
  <p class='mio-note'>${t("Use it as the HTTP password for git (any username), e.g. git clone https://<user>:<token>@host/repo.git. Only its SHA-256 hash is stored.", "在 git 里作为 HTTP 密码使用（用户名随意）。服务器只保存它的 SHA-256 哈希。")}</p>
</section>`;
    }
    const rows = await registry.listTokens();
    const table = rows.length
      ? `<div class='tk-wrap'><table class='tk'><thead><tr><th>${t("Name", "名称")}</th><th>${t("Role", "角色")}</th><th class='tk-c'>${t("Created", "创建时间")}</th><th class='tk-e'>${t("Expires", "到期")}</th><th class='tk-used'>${t("Last used", "最近使用")}</th><th><span class='sr-only'>${t("Actions", "操作")}</span></th></tr></thead><tbody>` +
        rows
          .map((r) => {
            const expired = r.expires_at > 0 && now >= r.expires_at;
            return (
              `<tr${expired ? " class='is-expired'" : ""}><td class='tk-name'><span data-noi18n>${esc(r.name)}</span><span class='tk-sub'>${t("Created", "创建")} ${fmtTime(r.created)} · ${t("Expires", "到期")} ${expiryHtml(r, now)} · ${t("Last used", "最近使用")} ${r.last_used ? fmtTime(r.last_used) : t("never", "从未")}</span></td><td><span class='tk-role' data-role='${r.role}'>${t(ROLE_LABEL[r.role][0], ROLE_LABEL[r.role][1])}</span></td>` +
              `<td class='tk-t tk-c'>${fmtTime(r.created)}</td><td class='tk-t tk-e'>${expiryHtml(r, now)}</td><td class='tk-t tk-used'>${r.last_used ? fmtTime(r.last_used) : t("Never", "从未")}</td>` +
              `<td class='tk-act'><a class='mio-btn mio-btn-danger mio-btn-xs' href='${CONSOLE}/tokens/${encodeURIComponent(r.id)}/revoke?next=${encodeURIComponent(next)}'>${expired ? t("Delete", "删除") : t("Revoke", "吊销")}</a></td></tr>`
            );
          })
          .join("") +
        `</tbody></table></div>`
      : `<div class='tk-empty'>${t("No tokens yet. The original push password keeps working as an admin token.", "还没有令牌。原来的推送密码继续作为管理员令牌有效。")}</div>`;
    const testTtl = parseInt(env.TEST_TOKEN_TTL_MS ?? "", 10) > 0;
    const expiryOpts =
      EXPIRY_CHOICES.map(([id, , en, zh]) => `<option value='${id}'${id === EXPIRY_DEFAULT ? " selected" : ""} data-zh='${esc(zh)}'>${esc(en)}</option>`).join("") +
      (testTtl ? `<option value='test'>test</option>` : "");
    const form = `<form class='dlg-sec' id='new-token' method='post' action='${CONSOLE}/tokens'>${csrfIn}
  <h3>${t("New token", "新建令牌")}</h3>
  ${opts.error ? `<div class='mio-dialog-err' role='alert'>${opts.error}</div>` : ""}
  <div class='mio-row tk-row'>
    <label class='mio-field'><span>${t("Name", "名称")}</span><input type='text' name='name' maxlength='64' required placeholder='hark6' autocomplete='off' spellcheck='false'/></label>
    <label class='mio-field mio-narrow'><span>${t("Role", "角色")}</span><select name='role'>
      <option value='writer'>${ROLE_LABEL.writer[1]} writer</option><option value='reader'>${ROLE_LABEL.reader[1]} reader</option><option value='admin'>${ROLE_LABEL.admin[1]} admin</option></select></label>
    <label class='mio-field mio-narrow'><span>${t("Expiration", "过期时间")}</span><select name='expires'>${expiryOpts}</select></label>
    <button type='submit' class='mio-btn mio-btn-primary mio-btn-md tk-create'>${t("Create token", "创建令牌")}</button>
  </div>
  <p class='mio-note tk-hint'>${t("Writer: read everything, push branches other than main; no tags, no new repositories. Reader: read only. The token is shown once.", "写入：可读全部仓库，可推送 main 以外的分支，不能推标签、不能建仓库。只读：只能拉取。令牌明文只显示一次。")}</p>
</form>`;
    const list = `<section class='dlg-sec'><h3>${t("Your tokens", "已有令牌")}</h3>${table}</section>`;
    return overPage(req, env, next, dialog({
      icon: ICON_KEY,
      size: "lg",
      title: t("Access tokens", "访问令牌"),
      desc: t("One token per assistant. Revoking takes effect immediately; an expired token stops working at once.", "每个助手一个令牌。吊销立即生效，过期的令牌也会立刻失效。"),
      body: reveal + list + form,
      footer: `<a class='mio-btn mio-btn-secondary mio-btn-md' href='${esc(next)}'>${t("Done", "完成")}</a>`,
      cancel: next,
    }), opts.error ? 400 : 200);
  }

  async function passwordDialog(req: Request, env: Env, csrf: string, next: string, error = ""): Promise<Response> {
    const body = `
  ${error ? `<div class='mio-dialog-err' role='alert'>${error}</div>` : ""}
  <input type='hidden' name='csrf' value='${esc(csrf)}'/>
  <input type='hidden' name='back' value='${esc(next)}'/>
  <input type='text' name='username' value='${esc(adminUser(env))}' autocomplete='username' hidden readonly tabindex='-1' aria-hidden='true'/>
  <label class='mio-field'><span>${t("Current password", "当前密码")}</span><input type='password' name='current' autocomplete='current-password' required autofocus/></label>
  <label class='mio-field'><span>${t("New password (at least 12 characters)", "新密码（至少 12 位）")}</span><input type='password' name='next' autocomplete='new-password' minlength='12' required/></label>
  <label class='mio-field'><span>${t("Repeat new password", "再次输入新密码")}</span><input type='password' name='confirm' autocomplete='new-password' minlength='12' required/></label>
  <button type='submit' class='mio-btn mio-btn-primary mio-btn-lg lg-submit'>${t("Change password", "修改密码")}</button>`;
    return overPage(req, env, next, dialog({
      icon: ICON_LOCK_KEY,
      size: "sm",
      title: t("Change console password", "修改管理台密码"),
      desc: t("Other signed-in browsers are signed out.", "修改后，其他已登录的浏览器会退出登录。"),
      body,
      footer: "",
      cancel: next,
      backdropCloses: false,
      formAction: `${CONSOLE}/password`,
    }), error ? 400 : 200);
  }

  type SettingsSection = "general" | "visibility" | "danger";
  const SECTIONS: SettingsSection[] = ["general", "visibility", "danger"];
  const asSection = (v: string | null): SettingsSection => ((SECTIONS as string[]).includes(v ?? "") ? (v as SettingsSection) : "general");

  /**
   * Repository settings as its own page in the repository layout (GitHub-style):
   * repo title + tab bar with "Settings" active, a section nav (General /
   * Visibility / Danger zone, one page each, ?s=…) and one panel per section.
   * Built from mio-field / mio-check / mio-btn and CDS tokens; no dialog, no script.
   */
  async function repoSettingsPage(env: Env, csrf: string, info: RepoInfo, section: SettingsSection, opts: { error?: string; notice?: string } = {}): Promise<Response> {
    const href = `${CONSOLE}/repos/${repoUrl(info.name)}`;
    const nav: [SettingsSection, string, string][] = [
      ["general", ICON_SLIDERS, t("General", "常规")],
      ["visibility", ICON_GLOBE, t("Visibility", "可见性")],
      ["danger", ICON_WARNING, t("Danger zone", "危险区")],
    ];
    const navHtml =
      `<nav class='rs-nav' aria-label='Settings'><ul>` +
      nav.map(([id, icon, label]) => `<li><a href='${href}?s=${id}'${id === section ? " aria-current='page'" : ""}${id === "danger" ? " class='is-danger'" : ""}>${icon}${label}</a></li>`).join("") +
      `</ul></nav>`;
    const alert = (opts.error ? `<div class='mio-dialog-err' role='alert'>${opts.error}</div>` : "") + (opts.notice ? `<div class='mio-dialog-ok' role='status'>${opts.notice}</div>` : "");
    const csrfIn = `<input type='hidden' name='csrf' value='${esc(csrf)}'/>`;
    const priv = !!info.priv;
    let panel: string;
    if (section === "general") {
      panel = `<form class='rs-panel' method='post' action='${href}'>${csrfIn}<input type='hidden' name='s' value='general'/>
  <div class='rs-panel-h'><h2>${t("General", "常规")}</h2><p class='mio-note'>${t("Shown on the repository list and the repository page.", "显示在仓库列表和仓库页上。")}</p></div>
  ${alert}
  <label class='mio-field'><span>${t("Description", "描述")}</span><textarea name='description' maxlength='500' rows='3'>${esc(info.desc)}</textarea></label>
  <div class='mio-row'>
    <label class='mio-field'><span>${t("Owner", "所有者")}</span><input type='text' name='owner' maxlength='64' value='${esc(info.owner)}' autocomplete='off'/></label>
    <label class='mio-field'><span>${t("Section", "分组")}</span><input type='text' name='section' maxlength='64' value='${esc(info.section)}' autocomplete='off'/></label>
  </div>
  <div class='rs-actions'><button type='submit' class='mio-btn mio-btn-primary mio-btn-md'>${t("Save", "保存")}</button></div>
</form>`;
    } else if (section === "visibility") {
      panel = `<form class='rs-panel' method='post' action='${href}'>${csrfIn}<input type='hidden' name='s' value='visibility'/>
  <div class='rs-panel-h'><h2>${t("Visibility", "可见性")}</h2><p class='mio-note'>${t("Currently", "当前")} <span class='mio-badge ${priv ? "mio-badge-accent" : "mio-badge-neutral"}'>${priv ? t("Private", "私有") : t("Public", "公开")}</span></p></div>
  ${alert}
  <label class='mio-check'><input type='checkbox' name='private' value='1'${priv ? " checked" : ""}/><span>${t("Private (requires a token to read)", "私有（需要令牌才能读取）")}</span></label>
  <p class='mio-note rs-note'>${t("Public repositories can be browsed and cloned by anyone. Private ones only open in this console or with an access token.", "公开仓库任何人都能浏览和 clone；私有仓库只能在管理台里打开，或用访问令牌读取。")}</p>
  <div class='rs-actions'><button type='submit' class='mio-btn mio-btn-primary mio-btn-md'>${t("Save", "保存")}</button></div>
</form>`;
    } else {
      // native constraint validation (no script): the button only submits once the exact name is typed; the server checks it again
      const pattern = info.name.replace(/\./g, "\\.");
      panel = `<form class='rs-panel rs-danger' method='post' action='${href}/delete'>${csrfIn}
  <div class='rs-panel-h'><h2>${t("Delete this repository", "删除仓库")}</h2><p class='mio-note'>${t("All branches, tags, history and settings of this repository are removed, and clones stop working. This cannot be undone.", "这个仓库的全部分支、标签、历史和设置都会被清除，clone 会失效。不能恢复。")}</p></div>
  ${alert}
  <label class='mio-field'><span>${t("Type the repository name to confirm", "输入完整仓库名以确认")}: <b class='mono' data-noi18n>${esc(info.name)}</b></span><input type='text' name='confirm' required pattern='${esc(pattern)}' autocomplete='off' autocapitalize='off' spellcheck='false' data-noi18n${opts.error ? " aria-invalid='true'" : ""}/></label>
  <div class='rs-actions'><button type='submit' class='mio-btn mio-btn-danger-solid mio-btn-md'>${t("Delete repository", "删除仓库")}</button></div>
</form>`;
    }
    const body = `<section class='rs-page'>${navHtml}<div class='rs-main'>${panel}</div></section>`;
    const res = htmlResponse(layout({ ...deps.siteBase(env), title: `${info.name} · settings`, repo: info.name, sub: info.desc, tab: "settings", body }), opts.error ? 400 : 200);
    return noStore(repoChrome(res, info.name, priv, true));
  }

  /**
   * Console chrome for a repository page: links re-rooted under /~mio/r/<repo>/,
   * the logo back to the console list, a "Private" badge next to the title and
   * a "Settings" tab at the end of the tab bar (console only; public pages never
   * get it).
   */
  function repoChrome(res: Response, repo: string, priv: boolean, settingsActive: boolean, extra?: (rw: HTMLRewriter) => HTMLRewriter): Response {
    if (typeof HTMLRewriter === "undefined") return res;
    const base = `/${repoUrl(repo)}`;
    const mount = `${CONSOLE}/r${base}`;
    const fix = (v: string | null): string | null => {
      if (v === null) return null;
      if (v === "/") return `${CONSOLE}/`;
      if (v === base || v.startsWith(`${base}/`) || v.startsWith(`${base}?`)) return mount + v.slice(base.length);
      return null;
    };
    const attr = (name: string) => ({
      element(e: Element) {
        const v = fix(e.getAttribute(name));
        if (v !== null) e.setAttribute(name, v);
      },
    });
    const tab = `<a class='mio-tab-set${settingsActive ? " active" : ""}' href='${CONSOLE}/repos/${repoUrl(repo)}'${settingsActive ? " aria-current='page'" : ""}>${ICON_GEAR_SIX}${t("Settings", "设置")}</a>`;
    let rw = new HTMLRewriter()
      .on("a[href]", attr("href"))
      .on("link[href]", attr("href"))
      .on("img[src]", attr("src"))
      .on("form[action]", attr("action"))
      .on(".mio-head h1", { element(e) { if (priv) e.after(`<span class='mio-badge mio-badge-accent rl-priv-h'>${t("Private", "私有")}</span>`, { html: true }); } })
      .on("nav.mio-tabs", { element(e) { e.append(tab, { html: true }); } });
    if (extra) rw = extra(rw);
    const out = rw.transform(res);
    return new Response(out.body, out);
  }

  /**
   * Repository pages rendered by the cell, re-rooted under /~mio/r/<repo>/ so a
   * private repository is readable with the console session (behind Access)
   * and every in-page link, the branch switcher and the logo stay in the console.
   */
  async function viewer(req: Request, env: Env, repo: string, sub: string, priv: boolean): Promise<Response> {
    const url = new URL(req.url);
    const doUrl = new URL(req.url);
    doUrl.pathname = sub;
    const headers = new Headers({ "x-repo": repo, "x-host": url.host, "x-proto": url.protocol.replace(":", ""), "x-mio-role": "reader", "x-mio-token": "console" });
    for (const k of ["accept", "accept-language", "if-none-match"]) {
      const v = req.headers.get(k);
      if (v) headers.set(k, v);
    }
    const res = await env.REPO.getByName(repo).fetch(new Request(doUrl.toString(), { method: req.method, headers }));
    const html = (res.headers.get("content-type") ?? "").startsWith("text/html");
    if (!html || typeof HTMLRewriter === "undefined") {
      // raw files / archives / feeds under the console origin: never let them run anything
      const out = noStore(new Response(res.body, res));
      if (!html) out.headers.set("content-security-policy", "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox");
      out.headers.set("x-content-type-options", "nosniff");
      return out;
    }
    return noStore(
      repoChrome(res, repo, priv, false, (rw) =>
        rw.on("#mh-edit", {
          element(e) {
            const href = e.getAttribute("data-href");
            if (href && href.startsWith("/")) e.replace(`<a class='mio-btn mio-btn-ghost mio-btn-xs mio-btn-icon blob-edit' href='${CONSOLE}/edit${href.replace(/^\/([^/]+)\/edit/, "/$1").replace(/'/g, "%27")}' title='Edit' data-zh-title='编辑' aria-label='Edit'>${ICON_PENCIL}</a>`, { html: true });
            else e.remove();
          },
        })
      )
    );
  }

  /** Forward a web-editor request to the repository cell, with the console's own form action + CSRF token. */
  async function editor(req: Request, env: Env, repo: string, sub: string, csrf: string, session: string, passHash: string): Promise<Response> {
    const url = new URL(req.url);
    const doUrl = new URL(req.url);
    doUrl.pathname = sub;
    const headers = new Headers(req.headers);
    headers.set("x-repo", repo);
    headers.set("x-host", url.host);
    headers.set("x-proto", url.protocol.replace(":", ""));
    headers.set("x-mio-role", "admin");
    headers.set("x-mio-token", "console");
    let body: BodyInit | null = null;
    if (req.method === "POST") {
      const raw = await req.text();
      const form = new URLSearchParams(raw);
      if (!(await csrfValid(env, passHash, session, form.get("csrf")))) return text("bad CSRF token", 403);
      body = raw;
    }
    const res = await env.REPO.getByName(repo).fetch(new Request(doUrl.toString(), { method: req.method, headers, body }));
    if (req.method === "POST" && res.headers.has("x-location")) {
      if (res.headers.get("x-changed") === "1") {
        const idle = parseInt(res.headers.get("x-commit-time") ?? "", 10) || Date.now();
        try {
          const registry = env.REGISTRY.getByName("registry");
          await registry.upsert(repo, idle, res.headers.get("x-main-lang") ?? undefined);
        } catch {
          // registry deferred; next push heals
        }
        deps.invalidate(repo);
      }
      return redirect(res.headers.get("x-location")!);
    }
    if (typeof HTMLRewriter === "undefined" || !(res.headers.get("content-type") ?? "").startsWith("text/html")) return noStore(new Response(res.body, res));
    const out = new HTMLRewriter()
      .on("#ed-form", {
        element(e) {
          e.setAttribute("action", `${CONSOLE}/edit/${repoUrl(repo)}`);
          e.prepend(`<input type='hidden' name='csrf' value='${esc(csrf)}'/>`, { html: true });
        },
      })
      .transform(res);
    return noStore(new Response(out.body, out));
  }

  /** Entry point for every path under /~mio (and /~mio itself). */
  async function handle(req: Request, env: Env): Promise<Response> {
    let res = await route(req, env);
    if ((res.headers.get("set-cookie") ?? "").includes("mg_signed=")) return res;
    const passHash = await adminPasswordHash(env);
    const session = await validSession(req, env, passHash);
    const valid = !!session;
    // signed-in console pages get the account menu in the top bar's account slot
    if (session && passHash && typeof HTMLRewriter !== "undefined" && (res.headers.get("content-type") ?? "").startsWith("text/html")) {
      // (route() answers every request that fails the Access check with plain text, so HTML here passed it)
      const u = new URL(req.url);
      const here = /^\/~mio\/(tokens|password)(\/|$)/.test(u.pathname) ? dialogNext(u.searchParams.get("next")) : dialogNext(u.pathname + u.search);
      const menu = accountMenu(env, await csrfToken(env, passHash, session), here);
      const out = new HTMLRewriter().on("#mh-auth", { element(e) { e.replace(menu, { html: true }); } }).transform(res);
      res = new Response(out.body, out);
    }
    // a session from before the hint existed gets the hint on its next console visit;
    // a stale hint (session expired or signed out elsewhere) is dropped
    if (valid === hasHint(req)) return res;
    const out = new Response(res.body, res);
    out.headers.append("set-cookie", valid ? hintCookie() : clearHintCookie());
    return out;
  }

  async function route(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    if (path === CONSOLE) return redirect(`${CONSOLE}/`);

    // 1. Cloudflare Access, verified here too (fail closed): a mis-scoped
    //    Access rule must not leave the console reachable
    const access = await verifyAccess(req, env);
    if (!access.ok) return text(access.why, access.status);

    // 2. state-changing requests must be same-origin
    const mutating = req.method !== "GET" && req.method !== "HEAD";
    if (mutating && !sameOrigin(req)) return text("cross-site request refused", 403);
    if (req.method !== "GET" && req.method !== "HEAD" && req.method !== "POST") return text("method not allowed", 405);

    const registry = env.REGISTRY.getByName("registry");
    const passHash = await adminPasswordHash(env);
    const session = await validSession(req, env, passHash);
    const sub = path.slice(CONSOLE.length); // starts with "/"

    // ---- sign-in ----
    if (sub === "/login") {
      if (req.method === "GET") {
        const next = safeNext(url.searchParams.get("next"));
        return session ? redirect(next) : loginPage(env, next);
      }
      const ip = clientIp(req);
      const form = await req.formData().catch(() => null);
      const next = safeNext((form?.get("next") as string | null) ?? null);
      const user = String(form?.get("username") ?? "");
      const pass = String(form?.get("password") ?? "");
      const remember = form?.get("remember") === "1";
      if (!passHash) return loginPage(env, next, t("The console password is not configured (ADMIN_PASSWORD_HASH).", "管理台密码未配置（ADMIN_PASSWORD_HASH）。"), user, remember);
      const wait = await registry.loginBlocked(ip);
      if (wait > 0) return loginPage(env, next, t(`Too many failed attempts. Try again in ${Math.ceil(wait / 60000)} min.`, `失败次数过多，请 ${Math.ceil(wait / 60000)} 分钟后再试。`), user, remember);
      // always run both checks (no early exit on a wrong username)
      const userOk = await secretsEqual(user, adminUser(env));
      const passOk = await verifyPassword(pass, passHash);
      if (!userOk || !passOk) {
        await registry.loginFailed(ip);
        return loginPage(env, next, t("Wrong username or password.", "用户名或密码不正确。"), user, remember);
      }
      await registry.loginSucceeded(ip);
      return redirect(next, sessionCookie(await makeSession(env, passHash, remember ? REMEMBER_TTL_S : SESSION_TTL_S), remember), hintCookie());
    }

    if (!session || !passHash) {
      if (req.method === "GET") return redirect(`${CONSOLE}/login?next=${encodeURIComponent(path + url.search)}`);
      return text("sign in required", 401);
    }
    const csrf = await csrfToken(env, passHash, session);

    // every POST below needs the CSRF token (the editor checks its own)
    let form: FormData | null = null;
    if (req.method === "POST" && !sub.startsWith("/edit/")) {
      form = await req.formData().catch(() => null);
      if (!(await csrfValid(env, passHash, session, (form?.get("csrf") as string | null) ?? null))) return text("bad CSRF token", 403);
    }

    if (sub === "/logout" && req.method === "POST") return redirect("/", clearSessionCookie(), clearHintCookie());
    if (sub === "/" && req.method === "GET") {
      const n = url.searchParams.get("done");
      const dn = url.searchParams.get("name") ?? "";
      return home(
        env,
        n === "password"
          ? t("Password changed.", "密码已修改。")
          : n === "settings"
            ? t("Settings saved.", "设置已保存。")
            : n === "deleted" && REPO_NAME.test(dn) && dn.length <= 100
              ? t(`Repository “${dn}” deleted.`, `已删除仓库「${dn}」。`)
              : ""
      );
    }

    // ---- tokens ----
    if (sub === "/tokens") {
      const next = dialogNext(req.method === "GET" ? url.searchParams.get("next") : ((form?.get("next") as string | null) ?? null));
      const tokensPage = (e: Env, c: string, o?: Parameters<typeof tokensDialog>[4]) => tokensDialog(req, e, c, next, o);
      if (req.method === "GET") return tokensPage(env, csrf);
      const name = String(form!.get("name") ?? "").trim();
      const role = String(form!.get("role") ?? "");
      if (!name || name.length > 64 || /[\x00-\x1f\x7f]/.test(name)) return tokensPage(env, csrf, { error: t("Name must be 1–64 characters.", "名称需为 1–64 个字符。") });
      if (!isRole(role)) return tokensPage(env, csrf, { error: t("Unknown role.", "未知角色。") });
      const expiresAt = expiryFromForm(form!.has("expires") ? String(form!.get("expires")) : null, env);
      if (expiresAt === undefined) return tokensPage(env, csrf, { error: t("Unknown expiration.", "未知的过期时间。") });
      const secret = newTokenSecret();
      const row = await registry.createToken(newTokenId(), await sha256Hex(secret), name, role, expiresAt);
      return tokensPage(env, csrf, { created: { row, secret } });
    }
    const rv = /^\/tokens\/([A-Za-z0-9_-]{1,40})\/revoke$/.exec(sub);
    if (rv) {
      const row = await registry.tokenById(rv[1]);
      const next = dialogNext(req.method === "GET" ? url.searchParams.get("next") : ((form?.get("next") as string | null) ?? null));
      const back = `${CONSOLE}/tokens?next=${encodeURIComponent(next)}`;
      if (req.method === "GET") return row ? tokensDialog(req, env, csrf, next, { revoke: row }) : redirect(back);
      if (row) await registry.revokeToken(row.id);
      return redirect(back);
    }

    // ---- password ----
    if (sub === "/password") {
      const back = dialogNext(req.method === "GET" ? url.searchParams.get("next") : ((form?.get("back") as string | null) ?? null));
      const passwordPage = (e: Env, c: string, err = "") => passwordDialog(req, e, c, back, err);
      if (req.method === "GET") return passwordPage(env, csrf);
      const cur = String(form!.get("current") ?? "");
      const next = String(form!.get("next") ?? "");
      const confirm = String(form!.get("confirm") ?? "");
      const ip = clientIp(req);
      if ((await registry.loginBlocked(ip)) > 0) return passwordPage(env, csrf, t("Too many failed attempts. Try again later.", "失败次数过多，请稍后再试。"));
      if (!(await verifyPassword(cur, passHash))) {
        await registry.loginFailed(ip);
        return passwordPage(env, csrf, t("Current password is wrong.", "当前密码不正确。"));
      }
      if (next.length < 12 || next.length > 256) return passwordPage(env, csrf, t("The new password needs 12–256 characters.", "新密码需为 12–256 位。"));
      if (next !== confirm) return passwordPage(env, csrf, t("The two new passwords differ.", "两次输入的新密码不一致。"));
      const h = await hashPassword(next);
      await registry.setSetting("admin_password_hash", h);
      // the session key is bound to the hash: everyone else is signed out, this browser gets a fresh cookie
      // keep "remember me" if this browser had it (a session longer than the 12 h default)
      const kept = sessionSecondsLeft(session) > SESSION_TTL_S;
      return redirect(`${CONSOLE}/?done=password`, sessionCookie(await makeSession(env, h, kept ? REMEMBER_TTL_S : SESSION_TTL_S), kept), hintCookie());
    }

    // ---- browse any repository (public or private) inside the console: /~mio/r/<repo>/<page> ----
    const vw = /^\/r\/([^/]+)(\/.*)?$/.exec(sub);
    if (vw) {
      if (req.method !== "GET" && req.method !== "HEAD") return text("method not allowed", 405);
      let name: string;
      try {
        name = decodeURIComponent(vw[1]);
      } catch {
        return text("bad repository name", 400);
      }
      if (!REPO_NAME.test(name)) return text("bad repository name", 400);
      const vinfo = await registry.get(name);
      if (!vinfo) return text(`no such repository: ${name}`, 404);
      const rest = vw[2];
      if (!rest) return redirect(`${CONSOLE}/r/${repoUrl(name)}/${url.search}`);
      // pages only: git protocol, the JSON API and the editor have their own doors
      const moved = req.method === "GET" ? deps.movedTab(rest) : null;
      if (moved !== null) return new Response(null, { status: 301, headers: { location: `${CONSOLE}/r/${repoUrl(name)}${moved}${url.search}`, "cache-control": "no-store" } });
      if (/^\/(info\/refs|git-upload-pack|git-receive-pack)$/.test(rest) || rest.startsWith("/api/") || rest === "/edit" || rest.startsWith("/edit/")) return text("not found", 404);
      return viewer(req, env, name, rest, !!vinfo.priv);
    }

    // ---- delete a repository (console only; git tokens, admin included, cannot) ----
    const rd = /^\/repos\/([^/]+)\/delete$/.exec(sub);
    if (rd) {
      let name: string;
      try {
        name = decodeURIComponent(rd[1]);
      } catch {
        return text("bad repository name", 400);
      }
      if (!REPO_NAME.test(name)) return text("bad repository name", 400);
      const info = await registry.get(name);
      if (!info) return req.method === "GET" ? redirect(`${CONSOLE}/`) : text(`no such repository: ${name}`, 404);
      if (req.method === "GET") return redirect(`${CONSOLE}/repos/${repoUrl(name)}?s=danger`);
      if (String(form!.get("confirm") ?? "") !== name) return repoSettingsPage(env, csrf, info, "danger", { error: t("The name does not match. Nothing was deleted.", "仓库名不一致，未删除。") });
      // wipe the cell (SQLite tables + alarm) and its R2 packs first, then the registry row:
      // if the wipe fails the repository stays listed and can be retried
      const res = await env.REPO.getByName(name).fetch(
        new Request(`${url.origin}/`, { method: "DELETE", headers: { "x-repo": name, "x-host": url.host, "x-mio-role": "admin", "x-mio-token": "console" } })
      );
      if (!res.ok) return repoSettingsPage(env, csrf, info, "danger", { error: esc((await res.text()).slice(0, 200)) });
      await registry.remove(name);
      await deps.invalidate(name, url.origin);
      return redirect(`${CONSOLE}/?done=deleted&name=${encodeURIComponent(name)}`);
    }

    // ---- repository settings ----
    const rs = /^\/repos\/([^/]+)$/.exec(sub);
    if (rs) {
      let name: string;
      try {
        name = decodeURIComponent(rs[1]);
      } catch {
        return text("bad repository name", 400);
      }
      if (!REPO_NAME.test(name)) return text("bad repository name", 400);
      const info = await registry.get(name);
      if (!info) return text(`no such repository: ${name}`, 404);
      if (req.method === "GET") {
        const sec = asSection(url.searchParams.get("s"));
        return repoSettingsPage(env, csrf, info, sec, { notice: url.searchParams.get("done") === "1" ? t("Settings saved.", "设置已保存。") : "" });
      }
      // each section page posts only its own fields (s=general | visibility);
      // the rest keep their current values. Without s, every field comes from the form.
      const part = String(form!.get("s") ?? "");
      const general = part !== "visibility";
      const visibility = part !== "general";
      const cfg = {
        description: general ? String(form!.get("description") ?? "").trim().slice(0, 500) : info.desc,
        owner: general ? String(form!.get("owner") ?? "").trim().slice(0, 64) : info.owner,
        section: general ? String(form!.get("section") ?? "").trim().slice(0, 64) : info.section,
        private: visibility ? form!.get("private") === "1" : !!info.priv,
      };
      const sec: SettingsSection = part === "visibility" ? "visibility" : "general";
      const res = await env.REPO.getByName(name).fetch(
        new Request(`${url.origin}/config`, {
          method: "PUT",
          headers: { "content-type": "application/json", "x-repo": name, "x-host": url.host, "x-mio-role": "admin", "x-mio-token": "console" },
          body: JSON.stringify(cfg),
        })
      );
      if (!res.ok) return repoSettingsPage(env, csrf, info, sec, { error: esc((await res.text()).slice(0, 200)) });
      const idle = parseInt(res.headers.get("x-commit-time") ?? "", 10) || info.idle;
      await registry.setConfig(name, { desc: cfg.description, owner: cfg.owner, section: cfg.section, priv: cfg.private }, idle, res.headers.get("x-main-lang") ?? undefined);
      deps.invalidate(name);
      return redirect(`${CONSOLE}/repos/${repoUrl(name)}?s=${sec}&done=1`);
    }

    // ---- web editor: GET /~mio/edit/<repo>/<path>?h=<branch>, POST /~mio/edit/<repo> ----
    const ed = /^\/edit\/([^/]+)(\/.*)?$/.exec(sub);
    if (ed) {
      let repo: string;
      try {
        repo = decodeURIComponent(ed[1]);
      } catch {
        return text("bad repository name", 400);
      }
      if (!REPO_NAME.test(repo)) return text("bad repository name", 400);
      if (!(await registry.get(repo))) return text(`no such repository: ${repo}`, 404);
      if (req.method === "GET" && ed[2] && ed[2] !== "/") return editor(req, env, repo, `/edit${ed[2]}`, csrf, session, passHash);
      if (req.method === "POST" && !ed[2]) return editor(req, env, repo, "/edit", csrf, session, passHash);
      return text("not found", 404);
    }

    return text("not found", 404);
  }

  return { handle };
}
