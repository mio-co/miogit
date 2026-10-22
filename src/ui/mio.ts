/**
 * Mio skin for dgit: MioUI CDS tokens + skill-mio-claude-ui rules.
 * Only semantic tokens (no raw HEX outside the token file); hairline borders,
 * single closed border per container, motion 60/120/200/300/450, reduced-motion.
 */
import { CDS_CSS } from "./cds";

const APP_CSS = String.raw`
*,::before,::after{box-sizing:border-box}
html{color-scheme:light;-webkit-text-size-adjust:100%}
html.dark{color-scheme:dark}
body{margin:0;background:var(--cds-surface-0);color:var(--cds-text-primary);
  font-family:var(--cds-font-body);font-size:.875rem;line-height:1.25rem;
  font-variation-settings:'wght' var(--cds-wght);-webkit-font-smoothing:antialiased;
  min-height:100dvh;display:flex;flex-direction:column}
html[data-i18n-pending] body{visibility:hidden}
::selection{background:var(--cds-accent-selection)}
a{color:inherit;text-decoration:none}
:focus-visible{outline:none;box-shadow:var(--cds-focus-shadow);border-radius:6px}
code,pre,kbd,samp,.mono{font-family:var(--font-anthropic-mono)}
h1,h2,h3{text-wrap:balance}
p{text-wrap:pretty}

/* ---------- 顶栏 ---------- */
.mio-top{position:sticky;top:0;z-index:20;height:var(--site-header);
  background:color-mix(in srgb,var(--cds-surface-0) 82%,transparent);
  backdrop-filter:saturate(1.4) blur(12px);-webkit-backdrop-filter:saturate(1.4) blur(12px);
  box-shadow:0 var(--cds-ring-hairline) 0 0 var(--cds-border)}
.mio-wrap{width:100%;max-width:72rem;margin:0 auto;padding:0 24px}
.mio-top .mio-wrap{height:100%;display:flex;align-items:center;gap:8px;min-width:0}
.mio-brand{display:inline-flex;align-items:center;gap:8px;font-weight:600;font-size:.9375rem;white-space:nowrap}
.mio-logo{width:22px;height:22px;border-radius:6px;background:var(--cds-accent);color:var(--cds-accent-foreground);
  display:inline-grid;place-items:center;font-family:var(--font-anthropic-serif);font-size:14px;font-weight:600}
.mio-crumb{display:flex;align-items:center;gap:8px;min-width:0;color:var(--cds-text-secondary)}
.mio-crumb .sep{color:var(--cds-text-muted)}
.mio-crumb a{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--cds-text-primary);font-weight:500}
.mio-actions{margin-left:auto;display:flex;align-items:center;gap:8px}

/* 分段胶囊（spec §6.5：轨道 999px、内边距 1px、120ms snap） */
.mio-seg{position:relative;display:inline-flex;padding:1px;border-radius:var(--cds-radius-pill);
  background:var(--cds-segmented-track);height:var(--cds-h-control-sm)}
.mio-seg button{appearance:none;border:0;background:transparent;color:var(--cds-text-secondary);
  font:inherit;font-size:12.5px;min-width:30px;padding:0 10px;border-radius:var(--cds-radius-pill);cursor:pointer;
  display:inline-grid;place-items:center;transition:color var(--cds-dur-snap) var(--cds-ease-snap),background-color var(--cds-dur-snap) var(--cds-ease-snap),box-shadow var(--cds-dur-snap) var(--cds-ease-snap)}
.mio-seg button:hover{color:var(--cds-text-primary)}
.mio-seg button[aria-pressed='true']{background:var(--cds-segmented-thumb);color:var(--cds-text-primary);box-shadow:var(--cds-segmented-thumb-shadow)}
.mio-seg svg{width:14px;height:14px;display:block}

/* ---------- 主体 ---------- */
#cgit{flex:1;width:100%;max-width:72rem;margin:0 auto;padding:28px 24px 48px}
.mio-head{margin:0 0 4px;display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
.mio-head h1{margin:0;font-size:1.25rem;line-height:1.75rem;font-weight:600;letter-spacing:-.01em;overflow-wrap:anywhere}
.mio-badge{font-size:11px;line-height:18px;padding:0 8px;border-radius:var(--cds-radius-pill);
  box-shadow:inset 0 0 0 1px var(--cds-border-strong);color:var(--cds-text-secondary)}
.mio-sub{margin:0 0 18px;color:var(--cds-text-secondary)}

/* 标签栏：ghost，选中 = 底部 2px 强调线 */
.mio-tabs{display:flex;align-items:center;gap:2px;box-shadow:inset 0 calc(-1 * var(--cds-ring-hairline)) 0 0 var(--cds-border);
  margin-bottom:20px;overflow-x:auto;scrollbar-width:none}
.mio-tabs::-webkit-scrollbar{display:none}
.mio-tabs a{position:relative;padding:10px 12px;color:var(--cds-text-secondary);white-space:nowrap;border-radius:8px 8px 0 0;
  transition:color var(--cds-dur-base) var(--cds-ease-swift),background-color 150ms var(--cds-ease-swift)}
.mio-tabs a:hover{color:var(--cds-text-primary);background:var(--cds-fill-ghost-hover)}
.mio-tabs a.active{color:var(--cds-text-primary);font-weight:500}
.mio-tabs a.active::after{content:'';position:absolute;left:10px;right:10px;bottom:0;height:2px;border-radius:2px;background:var(--cds-accent)}
.mio-tabs form{margin-left:auto;display:flex;gap:6px;align-items:center;padding:4px 0}
select,input[type=text],input[type=search],input:not([type]){font:inherit;font-size:max(13px,.8125rem);color:var(--cds-text-primary);
  background:var(--cds-surface-3);border:0;box-shadow:inset 0 0 0 1px var(--cds-border);border-radius:var(--cds-radius);
  height:var(--cds-h-control-sm);padding:0 10px;transition:box-shadow var(--cds-dur-base) var(--cds-ease-swift)}
select:hover,input:hover{box-shadow:inset 0 0 0 1px var(--cds-border-strong)}
select:focus-visible,input:focus-visible{outline:none;box-shadow:var(--cds-focus-shadow)}
input[type=submit],button.mio-btn{appearance:none;border:0;font:inherit;font-size:12.5px;cursor:pointer;height:var(--cds-h-control-sm);
  padding:0 10px;border-radius:var(--cds-radius);background:var(--cds-fill-secondary);color:var(--cds-text-primary);
  transition:background-color 150ms var(--cds-ease-swift),transform var(--cds-dur-slow) var(--cds-btn-spring)}
input[type=submit]:hover,button.mio-btn:hover{background:var(--cds-fill-secondary-hover)}
input[type=submit]:active,button.mio-btn:active{transform:scale(.975);transition:transform var(--cds-dur-fast) ease-out}

.path{margin:-6px 0 14px;color:var(--cds-text-secondary);font-family:var(--font-anthropic-mono);font-size:12.5px;overflow-wrap:anywhere}
.path a{color:var(--cds-accent-text)}
.path a:hover{text-decoration:underline}

/* ---------- 内容卡片（单闭合边框） ---------- */
.content{background:var(--cds-surface-2);border-radius:var(--cds-radius-card);box-shadow:var(--cds-panel-shadow);overflow:hidden;
  animation:message-fade-up var(--cds-dur-sheet) var(--cds-ease-enter) both}
.content:has(> .gh){background:none;box-shadow:none;overflow:visible}
.content > div:not(.gh):not(.md):not(.mio-empty),.content > p,.content > pre{margin:14px 16px}
table{border-collapse:collapse;width:100%}
table.list th{text-align:left;font-weight:500;font-size:12.5px;color:var(--cds-text-secondary);background:var(--cds-surface-1);
  padding:9px 16px;white-space:nowrap}
table.list td{padding:9px 16px;box-shadow:inset 0 var(--cds-ring-hairline) 0 0 var(--cds-border);vertical-align:middle}
table.list tr{transition:background-color 150ms var(--cds-ease-swift)}
table.list tr:not(.nohover):hover{background:var(--cds-fill-ghost-hover)}
table.list tr.nohover td[colspan]:empty,table.list tr.nohover td[colspan]:is(:not(.clone-url)):not(:has(*)){padding:6px;box-shadow:none}
table.list td a{color:var(--cds-text-primary)}
table.list td a:hover{color:var(--cds-accent-text)}
table.list th.right,table.list td.right,.right{text-align:right}
.nowrap td{white-space:nowrap}
td.ls-mode,table.list:has(td.ls-mode) tr > :first-child{display:none}
a.ls-dir{font-weight:500}
a.ls-dir::before,a.ls-blob::before{content:'';display:inline-block;width:16px;height:16px;margin-right:8px;vertical-align:-.2em;background:currentColor;
  -webkit-mask:var(--mio-ico) center/contain no-repeat;mask:var(--mio-ico) center/contain no-repeat;color:var(--cds-text-secondary)}
a.ls-dir::before{--mio-ico:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 256 256'%3E%3Cpath d='M216 72h-84.7L104 44.7A15.9 15.9 0 0 0 92.7 40H40a16 16 0 0 0-16 16v144.6A15.4 15.4 0 0 0 39.4 216h177.5a15.1 15.1 0 0 0 15.1-15.1V88a16 16 0 0 0-16-16Z'/%3E%3C/svg%3E");color:var(--cds-accent)}
a.ls-blob::before{--mio-ico:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 256 256'%3E%3Cpath fill='none' stroke='black' stroke-width='16' stroke-linejoin='round' d='M200 224H56a8 8 0 0 1-8-8V40a8 8 0 0 1 8-8h96l56 56v128a8 8 0 0 1-8 8Z M152 32v56h56'/%3E%3C/svg%3E")}
td.ls-size,.gh-size{text-align:right;color:var(--cds-text-secondary);font-family:var(--font-anthropic-mono);font-size:12px;font-variant-numeric:tabular-nums;width:8em}
table.list:has(td.ls-mode) td:last-child{text-align:right;width:13em;white-space:nowrap}
table.list:has(td.ls-mode) td:last-child a{color:var(--cds-text-hint);font-size:12px;margin-left:10px}
table.list:has(td.ls-mode) td:last-child a:hover{color:var(--cds-accent-text)}
td.sha1,.sha1,td.commitgraph{font-family:var(--font-anthropic-mono);font-size:12px;font-variant-numeric:tabular-nums}
td.logsubject{font-weight:500}
td.logmsg{white-space:pre-wrap;color:var(--cds-text-secondary);font-family:var(--font-anthropic-mono);font-size:12px}
.clone-url{font-family:var(--font-anthropic-mono);font-size:12.5px}
span[class^='age-']{color:var(--cds-text-secondary);font-variant-numeric:tabular-nums;white-space:nowrap}
span.age-mins,span.age-hours{color:var(--cds-text-success)}
a.branch-deco,a.tag-deco,a.deco,span.deco{display:inline-block;margin-left:8px;padding:0 8px;line-height:18px;border-radius:var(--cds-radius-pill);font-size:11px;font-weight:500;vertical-align:1px}
a.branch-deco{background:var(--cds-accent-soft);color:var(--cds-accent-text)!important}
a.tag-deco{background:var(--cds-fill-secondary);color:var(--cds-text-primary)!important}
.error{margin:16px;padding:12px 14px;border-radius:var(--cds-radius);background:color-mix(in oklab,var(--cds-fill-danger) 12%,transparent);color:var(--cds-text-danger)}
.mio-empty{padding:28px 20px;text-align:center;color:var(--cds-text-secondary)}
.mio-empty code{display:inline-block;margin-top:8px;padding:6px 10px;border-radius:var(--cds-radius);background:var(--cds-fill-secondary);color:var(--cds-text-primary);font-size:12px}

/* ---------- 代码 / blob / blame ---------- */
table.blob{font-family:var(--font-anthropic-mono);font-size:12.5px;line-height:1.25rem;background:var(--cds-surface-2)}
table.blob td{padding:0;vertical-align:top}
table.blob pre{margin:0;padding:12px 0}
td.linenumbers{width:1%;text-align:right;user-select:none;background:var(--cds-surface-1);box-shadow:inset calc(-1 * var(--cds-ring-hairline)) 0 0 var(--cds-border)}
td.linenumbers pre{padding:12px 12px 12px 16px!important;color:var(--cds-text-muted)}
td.linenumbers a{color:inherit}
td.linenumbers a:hover{color:var(--cds-accent-text)}
td.lines pre{padding:12px 16px!important;overflow-x:auto}
table.blame td.sha1{white-space:nowrap;padding:12px 16px;color:var(--cds-text-secondary);font-size:11.5px;box-shadow:inset 0 var(--cds-ring-hairline) 0 0 var(--cds-border)}
span.hl-c{color:var(--cds-text-muted);font-style:italic}
span.hl-s{color:var(--cds-text-success)}
span.hl-k{color:var(--cds-accent-text);font-weight:500}
span.hl-n{color:var(--cds-text-warning)}

/* ---------- 提交 / 差异 ---------- */
table.commit-info{margin:0}
table.commit-info th{text-align:left;font-weight:500;color:var(--cds-text-secondary);padding:8px 16px;width:8em;white-space:nowrap;font-size:12.5px}
table.commit-info td{padding:8px 16px;overflow-wrap:anywhere}
table.commit-info tr+tr>*{box-shadow:inset 0 var(--cds-ring-hairline) 0 0 var(--cds-border)}
table.commit-info a,.commit-subject a,.diffstat a{color:var(--cds-accent-text)}
.commit-subject{font-size:.9375rem;font-weight:600;padding:14px 16px 4px!important;margin:0!important;box-shadow:inset 0 var(--cds-ring-hairline) 0 0 var(--cds-border)}
.commit-msg{white-space:pre-wrap;color:var(--cds-text-secondary);padding:0 16px 14px;margin:0!important;font-size:13px}
.diffstat-header{font-weight:500;padding:10px 16px!important;margin:0!important;background:var(--cds-surface-1);box-shadow:inset 0 var(--cds-ring-hairline) 0 0 var(--cds-border)}
table.diffstat td{padding:5px 16px;font-family:var(--font-anthropic-mono);font-size:12px;box-shadow:inset 0 var(--cds-ring-hairline) 0 0 var(--cds-border)}
td.add,div.add{color:var(--cds-text-success)}
td.del,div.del{color:var(--cds-text-danger)}
.diffstat-summary{color:var(--cds-text-secondary);font-size:12.5px;padding:8px 16px!important;margin:0!important}
table.diff{font-family:var(--font-anthropic-mono);font-size:12.5px;line-height:1.25rem}
table.diff>tbody>tr>td,table.diff>tr>td{padding:0}
table.diff div{white-space:pre;padding:0 16px;overflow-wrap:normal}
table.diff div.head{font-weight:600;padding:10px 16px;margin-top:0;background:var(--cds-surface-1);color:var(--cds-text-primary);
  box-shadow:inset 0 var(--cds-ring-hairline) 0 0 var(--cds-border),inset 0 calc(-1 * var(--cds-ring-hairline)) 0 0 var(--cds-border);white-space:normal;overflow-wrap:anywhere}
table.diff div.hunk{color:var(--cds-text-hint);background:var(--cds-fill-ghost-hover)}
table.diff div.add{background:color-mix(in oklab,var(--cds-fill-success) 12%,transparent)}
table.diff div.del{background:color-mix(in oklab,var(--cds-fill-danger) 11%,transparent)}
table.diff td{overflow-x:auto;display:block}
.modechange{color:var(--cds-text-warning)}

.content > form{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:12px 16px;margin:0;box-shadow:inset 0 calc(-1 * var(--cds-ring-hairline)) 0 0 var(--cds-border)}
.content > form input:not([type=submit]){flex:1;min-width:10em;max-width:24em}
/* ---------- 统计 ---------- */
table.stats td,table.stats th{padding:6px 16px;font-variant-numeric:tabular-nums}

/* ---------- GitHub 式概览 ---------- */
.gh{display:flex;flex-direction:column;gap:16px}
.gh-top{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
.gh-meta{display:flex;gap:6px;flex-wrap:wrap}
.gh-meta a{display:inline-flex;align-items:center;gap:6px;height:var(--cds-h-control-sm);padding:0 10px;border-radius:var(--cds-radius);
  color:var(--cds-text-secondary);transition:background-color 150ms var(--cds-ease-swift),color 150ms var(--cds-ease-swift)}
.gh-meta a:hover{background:var(--cds-fill-ghost-hover);color:var(--cds-text-primary)}
.gh-meta b{color:var(--cds-text-primary);font-weight:600;font-variant-numeric:tabular-nums}
.gh-clone{display:flex;align-items:center;gap:0;border-radius:var(--cds-radius);box-shadow:inset 0 0 0 1px var(--cds-border);background:var(--cds-surface-3);
  height:var(--cds-h-control);padding-left:12px;max-width:100%}
.gh-clone span{color:var(--cds-text-secondary);font-size:12.5px;white-space:nowrap}
.gh-clone input{box-shadow:none!important;background:transparent;width:min(340px,60vw);font-family:var(--font-anthropic-mono);font-size:12px;height:100%}
.gh-clone button{height:calc(100% - 6px);margin:3px}
.gh-card{background:var(--cds-surface-2);border-radius:var(--cds-radius-card);box-shadow:var(--cds-panel-shadow);overflow:hidden}
.gh-card-h{display:flex;align-items:center;gap:8px;padding:11px 16px;background:var(--cds-surface-1);
  box-shadow:inset 0 calc(-1 * var(--cds-ring-hairline)) 0 0 var(--cds-border);font-weight:500;min-width:0}
.gh-commit{font-weight:400}
.gh-commit .who{font-weight:600}
.gh-commit .msg{color:var(--cds-text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.gh-commit .msg:hover{color:var(--cds-text-primary)}
.gh-age{margin-left:auto;color:var(--cds-text-secondary);font-size:12px;white-space:nowrap;display:flex;gap:8px;align-items:center}
.gh-age a{font-family:var(--font-anthropic-mono)}
.gh-age a:hover{color:var(--cds-accent-text)}
table.gh-files tr:first-child td{box-shadow:none}
.gh-readme .gh-card-h svg{width:16px;height:16px;color:var(--cds-text-secondary)}

/* ---------- Markdown ---------- */
.md{padding:8px 32px 28px;line-height:1.7;font-size:.9375rem;overflow-wrap:anywhere}
.md h1,.md h2{padding-bottom:.3em;box-shadow:inset 0 calc(-1 * var(--cds-ring-hairline)) 0 0 var(--cds-border)}
.md h1{font-size:1.75rem;line-height:1.3;margin:24px 0 16px;font-weight:600}
.md h2{font-size:1.35rem;line-height:1.35;margin:28px 0 14px;font-weight:600}
.md h3{font-size:1.1rem;margin:22px 0 10px;font-weight:600}
.md a{color:var(--cds-accent-text);text-decoration:underline;text-decoration-color:color-mix(in srgb,currentColor 35%,transparent);text-underline-offset:3px}
.md pre{background:var(--cds-code-bg);color:#e8e8e6;border-radius:var(--cds-radius-code);padding:14px 16px;overflow:auto;font-size:12.5px;line-height:1.6}
html:not(.dark) .md pre{background:var(--cds-surface-1);color:var(--cds-text-primary);box-shadow:inset 0 0 0 1px var(--cds-border)}
.md pre code{background:none!important;padding:0;box-shadow:none}
.md :not(pre)>code{font-size:.85em;padding:.15em .4em;border-radius:6px;background:var(--cds-fill-secondary)}
.md blockquote{margin:0;padding:0 16px;color:var(--cds-text-secondary);box-shadow:inset 3px 0 0 0 var(--cds-border-strong)}
.md table{width:auto;margin:12px 0}
.md th,.md td{padding:6px 12px;box-shadow:inset 0 0 0 var(--cds-ring-hairline) var(--cds-border)}
.md img{max-width:100%;border-radius:var(--cds-radius)}
.md hr{border:0;height:var(--cds-ring-hairline);background:var(--cds-border)}

/* ---------- 页脚 ---------- */
.mio-foot{padding:20px 0 28px;color:var(--cds-text-hint);font-size:12px}
.mio-foot-in{display:flex;align-items:center;justify-content:space-between;gap:8px 24px;flex-wrap:wrap}
.mio-friends{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:4px 18px}
.mio-friends a{color:var(--cds-text-secondary);text-decoration:none;padding:2px 0;border-radius:var(--cds-radius-sm,4px);transition:color var(--cds-dur-base) var(--cds-ease-swift)}
.mio-friends a:hover{color:var(--cds-text-primary);text-decoration:underline;text-underline-offset:3px}
.mio-friends a:focus-visible{outline:none;box-shadow:var(--cds-focus-shadow)}
@media (max-width:640px){.mio-foot{padding:16px 0 calc(24px + env(safe-area-inset-bottom))}.mio-foot-in{flex-direction:column-reverse;justify-content:center;gap:10px}.mio-friends{justify-content:center;gap:2px 20px}.mio-friends a{padding:4px 0;font-size:13px}}
.mio-foot b{color:var(--cds-text-secondary);font-weight:600}
.mio-foot .heart{color:var(--cds-accent)}

a.mio-btn{display:inline-flex;align-items:center;height:var(--cds-h-control-sm);padding:0 12px;border-radius:var(--cds-radius);font-size:12.5px;color:var(--cds-text-primary);text-decoration:none;transition:background-color 150ms var(--cds-ease-swift)}
.mio-btn-ghost{background:transparent!important;box-shadow:inset 0 0 0 1px var(--cds-border)}
a.mio-btn-ghost:hover,button.mio-btn-ghost:hover{background:var(--cds-fill-ghost-hover)!important}
.mio-auth{margin:0;display:inline-flex}
button.mio-btn-primary{background:#d97757;color:#fff;box-shadow:var(--cds-shadow-2xs,0 1px 2px rgba(0,0,0,.06))}
button.mio-btn-primary:hover{background:#cc5a36}
button.mio-btn-primary:active{filter:brightness(.95)}
.rl-priv{margin-left:8px;vertical-align:1px}
.mio-btn-md{height:var(--cds-h-control)!important;padding:0 14px!important;font-size:13.5px!important;font-weight:500;border-radius:var(--cds-radius-btn-md,8px)!important}
a.mio-btn-secondary{background:var(--cds-fill-secondary)}
a.mio-btn-secondary:hover{background:var(--cds-fill-secondary-hover)}
html:has([data-dialog-layer]){overflow:hidden}
.content:has(> .mio-behind){background:none;box-shadow:none;overflow:visible}
.mio-behind{pointer-events:none;user-select:none}
.mio-dialog-layer{position:fixed;inset:0;z-index:100;display:grid;place-items:center;padding:max(1rem,env(safe-area-inset-top,0px)) 1rem}
.mio-backdrop{position:absolute;inset:0;background:var(--cds-backdrop);backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px);animation:mio-fade .15s ease-out both}
.mio-dialog{position:relative;box-sizing:border-box;width:100%;max-width:400px;max-height:var(--environment-dialog-cap,calc(100dvh - 2rem));overflow-y:auto;
  margin:0;padding:24px;display:flex;flex-direction:column;gap:16px;text-align:left;
  background:var(--cds-surface-popover,var(--cds-surface-2));border-radius:var(--cds-radius-dialog,16px);box-shadow:var(--cds-shadow-popover);
  animation:mio-dialog-in .2s cubic-bezier(.165,.84,.44,1) both}
.mio-dialog-icon{width:40px;height:40px;border-radius:50%;display:grid;place-items:center;background:var(--cds-accent-soft,color-mix(in srgb,var(--cds-accent) 10%,transparent));color:var(--cds-accent)}
.mio-dialog-icon svg{width:20px;height:20px}
.mio-dialog h2{margin:0;font-size:1.0625rem;line-height:1.5rem;font-weight:600;color:var(--cds-text-primary)}
.mio-dialog p{margin:-10px 0 0;color:var(--cds-text-secondary);font-size:13.5px;line-height:1.5}
.mio-dialog-err{background:color-mix(in srgb,var(--cds-fill-danger-solid,var(--cds-fill-danger)) 10%,transparent);color:var(--cds-text-danger);border-radius:var(--cds-radius);padding:8px 12px;font-size:13px}
.mio-field{display:flex;flex-direction:column;gap:6px;font-size:12.5px;font-weight:500;color:var(--cds-text-secondary)}
.mio-field input{font:inherit;font-weight:400;font-size:16px;color:var(--cds-text-primary);background:var(--cds-surface-3);border:0;box-shadow:inset 0 0 0 1px var(--cds-border);
  border-radius:var(--cds-radius);height:var(--cds-h-control-lg,37.65px);padding:0 12px;width:100%;box-sizing:border-box;transition:box-shadow var(--cds-dur-base) var(--cds-ease-swift)}
.mio-field input:hover{box-shadow:inset 0 0 0 1px var(--cds-border-strong)}
.mio-field input:focus-visible{outline:none;box-shadow:var(--cds-focus-shadow)}
.mio-field input[aria-invalid=true]{box-shadow:var(--cds-focus-shadow-danger)}
.mio-check{display:inline-flex;align-items:center;gap:8px;align-self:flex-start;font-size:13.5px;color:var(--cds-text-secondary);cursor:pointer;user-select:none;-webkit-tap-highlight-color:transparent;min-height:24px}
.mio-check input{appearance:none;-webkit-appearance:none;margin:0;flex:none;width:16px;height:16px;border-radius:var(--cds-checkbox-radius,4px);background:var(--cds-surface-3);box-shadow:inset 0 0 0 1px var(--cds-border-strong);cursor:pointer;display:grid;place-content:center;transition:background-color var(--cds-dur-base) var(--cds-ease-swift),box-shadow var(--cds-dur-base) var(--cds-ease-swift)}
.mio-check input::after{content:"";width:9px;height:5px;border:solid #fff;border-width:0 0 2px 2px;transform:translateY(-1px) rotate(-45deg) scale(0);transition:transform var(--cds-dur-base) var(--cds-ease-swift)}
.mio-check input:checked{background:#d97757;box-shadow:none}
.mio-check input:checked::after{transform:translateY(-1px) rotate(-45deg) scale(1)}
.mio-check:hover input:not(:checked){box-shadow:inset 0 0 0 1px var(--cds-text-tertiary,var(--cds-border-strong))}
.mio-check input:focus-visible{outline:none;box-shadow:var(--cds-focus-shadow)}
@media (prefers-reduced-motion:reduce){.mio-check input,.mio-check input::after{transition:none}}
.mio-dialog-actions{display:flex;justify-content:flex-end;gap:8px;padding-top:8px}
@keyframes mio-fade{from{opacity:0}to{opacity:1}}
@keyframes mio-dialog-in{from{opacity:0;transform:scale(.95)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.mio-backdrop,.mio-dialog{animation:none}}
.gh-langs{background:var(--cds-surface-2);border-radius:var(--cds-radius-card);box-shadow:var(--cds-panel-shadow);padding:14px 16px}
.gh-langs-h{font-weight:600;font-size:13px;margin-bottom:10px}
.gh-langbar{display:flex;height:8px;border-radius:var(--cds-radius-pill);overflow:hidden;gap:2px;background:var(--cds-fill-ghost-hover)}
.gh-langbar span{display:block;min-width:2px}
.gh-langs ul{list-style:none;margin:10px 0 0;padding:0;display:flex;flex-wrap:wrap;gap:6px 18px;font-size:12px;color:var(--cds-text-secondary)}
.gh-langs li{display:inline-flex;align-items:center;gap:6px;font-variant-numeric:tabular-nums}
.gh-langs li i{width:8px;height:8px;border-radius:50%;display:inline-block}
.gh-langs li b{color:var(--cds-text-primary);font-weight:600}
.content:has(> .repo-list){background:none;box-shadow:none;border-radius:0;overflow:visible;padding:0}
.rl-bar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 12px;flex-wrap:wrap}
.rl-count{color:var(--cds-text-secondary);font-size:13px}
.rl-sort button{padding:0 12px;height:26px;font-size:12.5px;white-space:nowrap}
ul.repo-list{list-style:none;margin:0;padding:0;background:var(--cds-surface-2);border-radius:var(--cds-radius-card);box-shadow:var(--cds-panel-shadow);overflow:hidden}
ul.repo-list li{display:grid;grid-template-columns:minmax(0,1fr) auto;grid-template-areas:"name meta" "desc meta";column-gap:16px;row-gap:2px;padding:12px 16px;box-shadow:inset 0 var(--cds-ring-hairline) 0 0 var(--cds-border);align-items:center}
ul.repo-list li:first-child{box-shadow:none}
ul.repo-list li{position:relative}
ul.repo-list li:hover{background:var(--cds-fill-ghost-hover)}
.rl-name::after{content:'';position:absolute;inset:0}
.rl-name{grid-area:name;font-weight:600;color:var(--cds-text-primary);overflow-wrap:anywhere}
.rl-name:hover{color:var(--cds-accent-text)}
.rl-desc{grid-area:desc;margin:0;color:var(--cds-text-secondary);font-size:13px;line-height:1.45;overflow-wrap:anywhere}
.rl-meta{grid-area:meta;display:flex;flex-direction:row;align-items:center;gap:16px;font-size:12px;color:var(--cds-text-secondary);white-space:nowrap;text-align:right}
.rl-lang{display:inline-flex;align-items:center;gap:6px;color:var(--cds-text-primary)}
.rl-lang i{width:10px;height:10px;border-radius:50%;display:inline-block;box-shadow:inset 0 0 0 1px rgba(0,0,0,.08)}
.rl-meta time{font-variant-numeric:tabular-nums}
@media (max-width:640px){
  ul.repo-list li{grid-template-columns:minmax(0,1fr);grid-template-areas:"name" "desc" "meta";padding:12px 14px}
  .rl-meta{gap:14px;margin-top:6px}

}
@media (max-width:640px){
  .mio-wrap,#cgit{padding-left:14px;padding-right:14px}

  .md{padding:4px 18px 22px}
  table.list th,table.list td{padding-left:12px;padding-right:12px}
  td.ls-size{display:none}
  .gh-clone{width:100%}
  .gh-clone input{flex:1;width:auto;min-width:0}
}
`;

export const CSS = CDS_CSS + "\n" + APP_CSS;

/** boot (theme/lang before paint) + toggles + client-side zh/en */
export const APP_JS = String.raw`(function(){
var d=document.documentElement,K='dgit-prefs',p={};
try{p=JSON.parse(localStorage.getItem(K)||'{}')}catch(e){}
var mq=window.matchMedia('(prefers-color-scheme: dark)');
function nav(){return (navigator.language||'').toLowerCase().indexOf('zh')===0?'zh':'en'}
function lang(){return p.lang==='en'||p.lang==='zh'?p.lang:nav()}
function theme(){return p.theme==='light'||p.theme==='dark'?p.theme:'system'}
function applyTheme(){var t=theme();d.classList.toggle('dark',t==='dark'||(t==='system'&&mq.matches))}
applyTheme();
if(mq.addEventListener)mq.addEventListener('change',applyTheme);
d.lang=lang()==='zh'?'zh-CN':'en';
if(lang()==='zh')d.setAttribute('data-i18n-pending','');
function save(){try{localStorage.setItem(K,JSON.stringify(p))}catch(e){}}
var Z={'about':'关于','summary':'概览','refs':'分支与标签','log':'提交历史','tree':'文件','commit':'提交','diff':'差异','stats':'统计','index':'仓库',
'switch':'切换','Name':'名称','Description':'描述','Owner':'所有者','Updated':'更新时间','Idle':'空闲','Branch':'分支','Tag':'标签','Commit message':'提交信息',
'Author':'作者','Age':'时间','Download':'下载','Clone':'克隆','Size':'大小','Mode':'权限','plain':'原始','blame':'追溯','path:':'路径：','root':'根目录',
'[no description]':'[暂无描述]','author':'作者','committer':'提交者','parent':'父提交','download':'下载','tagged object':'标记对象','tagger':'标记者',
'patch':'补丁','Diffstat':'变更统计','empty repository':'空仓库','Binary files differ':'二进制文件不同','Commit':'提交','Message':'信息','Files':'文件',
'Lines':'行数','Total':'合计','search':'搜索','grep':'内容','author ':'作者','committer ':'提交者','range':'范围','next':'下一页','prev':'上一页',
'[next]':'[下一页]','[prev]':'[上一页]','Committer':'提交者','Commits':'提交数','Period':'周期','by':'按','weekly':'周','monthly':'月','quarterly':'季度','yearly':'年',
'Contributors':'贡献者','Week':'周','Month':'月','Year':'年','no readme found':'没有找到 README','(new)':'（新增）','(deleted)':'（删除）','Binary file':'二进制文件'};
var U={'min.':'分钟前','hour':'小时前','hours':'小时前','day':'天前','days':'天前','week':'周前','weeks':'周前','month':'个月前','months':'个月前','year':'年前','years':'年前'};
function tr(root){
  var w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode:function(n){var e=n.parentNode;
    if(!e||/^(SCRIPT|STYLE|PRE|CODE|TEXTAREA)$/.test(e.nodeName)||e.closest('.md,.blob,.diff,.lines,[data-noi18n]'))return 2;return 1}});
  var n,list=[];while(n=w.nextNode())list.push(n);
  list.forEach(function(n){var s=n.nodeValue,t=s.trim();if(!t)return;
    if(Object.prototype.hasOwnProperty.call(Z,t)){n.nodeValue=s.replace(t,Z[t]);return}
    var m=/^(\d+) (min\.|hours?|days?|weeks?|months?|years?)$/.exec(t);
    if(m){n.nodeValue=s.replace(t,m[1]+' '+U[m[2]]);return}
    m=/^(\d+) files? changed, (\d+) insertions\(\+\), (\d+) deletions\(-\)(.*)$/.exec(t);
    if(m){n.nodeValue=m[1]+' 个文件变更，新增 '+m[2]+' 行，删除 '+m[3]+' 行'+(m[4]?'（差异已截断）':'');return}
    m=/^(.*) \((new|deleted)\)$/.exec(s);if(m){n.nodeValue=m[1]+(m[2]==='new'?'（新增）':'（删除）')}
  });
  root.querySelectorAll('input[type=submit]').forEach(function(b){if(Z[b.value])b.value=Z[b.value]});
  root.querySelectorAll('[data-zh]').forEach(function(e){e.textContent=e.getAttribute('data-zh')});
  root.querySelectorAll('[data-zh-title]').forEach(function(e){e.title=e.getAttribute('data-zh-title');e.setAttribute('aria-label',e.title)});
}
function ready(){
  if(lang()==='zh')tr(document.body);
  d.removeAttribute('data-i18n-pending');
  document.querySelectorAll('[data-set-lang]').forEach(function(b){b.setAttribute('aria-pressed',String(b.getAttribute('data-set-lang')===lang()));
    b.addEventListener('click',function(){if(lang()===b.getAttribute('data-set-lang'))return;p.lang=b.getAttribute('data-set-lang');save();location.reload()})});
  document.querySelectorAll('[data-set-theme]').forEach(function(b){b.setAttribute('aria-pressed',String(b.getAttribute('data-set-theme')===theme()));
    b.addEventListener('click',function(){p.theme=b.getAttribute('data-set-theme');save();applyTheme();
      document.querySelectorAll('[data-set-theme]').forEach(function(x){x.setAttribute('aria-pressed',String(x===b))})})});
  document.querySelectorAll('[data-copy]').forEach(function(b){b.addEventListener('click',function(){
    var v=b.getAttribute('data-copy');if(navigator.clipboard)navigator.clipboard.writeText(v);
    var o=b.textContent;b.textContent=lang()==='zh'?'已复制':'Copied';setTimeout(function(){b.textContent=o},2500)})});
  var dl=document.querySelector('[data-dialog-layer] .mio-dialog');
  if(dl){var go=function(){location.href=dl.getAttribute('data-cancel')||'/'};
    dl.parentNode.querySelector('.mio-backdrop').addEventListener('click',go);
    document.addEventListener('keydown',function(e){
      if(e.key==='Escape'&&!e.isComposing){e.preventDefault();go();return}
      if(e.key==='Tab'){var f=[].slice.call(dl.querySelectorAll('input:not([type=hidden]),button,a[href]'));if(!f.length)return;
        var a=f[0],z=f[f.length-1];if(e.shiftKey&&document.activeElement===a){e.preventDefault();z.focus()}else if(!e.shiftKey&&document.activeElement===z){e.preventDefault();a.focus()}
        else if(!dl.contains(document.activeElement)){e.preventDefault();a.focus()}}});
    var fi=dl.querySelector('input[type=password]');if(fi)fi.focus();}
  var L=document.getElementById('repo-list');
  if(L){var items=[].slice.call(L.children);
    function srt(k){items.sort(function(a,b){return k==='name'?a.getAttribute('data-name').localeCompare(b.getAttribute('data-name')):(+b.getAttribute('data-t'))-(+a.getAttribute('data-t'))});
      items.forEach(function(li){L.appendChild(li)});
      document.querySelectorAll('[data-sort]').forEach(function(x){x.setAttribute('aria-pressed',String(x.getAttribute('data-sort')===k))})}
    document.querySelectorAll('[data-sort]').forEach(function(b){b.addEventListener('click',function(){p.sort=b.getAttribute('data-sort');save();srt(p.sort)})});
    if(p.sort==='name')srt('name');}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready);else ready();
setTimeout(function(){d.removeAttribute('data-i18n-pending')},1500);
})();`;

/** skin version: busts edge page cache and asset URLs. Bump the layout tag when only HTML changes. */
export const UI_VER = (() => { let h = 5381; const s = CSS + APP_JS + "layout-v10"; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); })();
