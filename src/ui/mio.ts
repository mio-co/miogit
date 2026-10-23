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
svg{flex:none}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}

/* ========== 顶栏 ========== */
.mio-top{position:sticky;top:0;z-index:20;height:var(--site-header);
  background:color-mix(in srgb,var(--cds-surface-0) 82%,transparent);
  backdrop-filter:saturate(1.4) blur(12px);-webkit-backdrop-filter:saturate(1.4) blur(12px);
  box-shadow:0 var(--cds-ring-hairline) 0 0 var(--cds-border)}
.mio-wrap{width:100%;max-width:80rem;margin:0 auto;padding:0 24px}
.mio-top .mio-wrap{height:100%;display:flex;align-items:center;gap:8px;min-width:0}
.mio-brand{display:inline-flex;align-items:center;gap:8px;font-weight:600;font-size:.9375rem;white-space:nowrap;border-radius:var(--cds-radius)}
.mio-logo{width:22px;height:22px;flex:none;color:var(--cds-text-primary);display:block}
.mio-logo-dot{color:var(--cds-clay)}
.mio-actions{margin-left:auto;display:flex;align-items:center;gap:8px}

/* 分段胶囊（MioUI Segmented：轨道 999px、内边距 1px、120ms snap） */
.mio-seg{position:relative;display:inline-flex;padding:1px;border-radius:var(--cds-radius-pill);
  background:var(--cds-segmented-track);height:var(--cds-h-control-sm);flex:none}
.mio-seg :is(button,a){appearance:none;border:0;background:transparent;color:var(--cds-text-secondary);
  font:inherit;font-size:12.5px;min-width:30px;padding:0 10px;border-radius:var(--cds-radius-pill);cursor:pointer;white-space:nowrap;
  display:inline-grid;place-items:center;transition:color var(--cds-dur-snap) var(--cds-ease-snap),background-color var(--cds-dur-snap) var(--cds-ease-snap),box-shadow var(--cds-dur-snap) var(--cds-ease-snap)}
.mio-seg :is(button,a):hover{color:var(--cds-text-primary)}
.mio-seg :is(button[aria-pressed='true'],a[aria-current]){background:var(--cds-segmented-thumb);color:var(--cds-text-primary);box-shadow:var(--cds-segmented-thumb-shadow)}
.mio-seg svg{width:14px;height:14px;display:block}
.mio-seg-links{height:var(--cds-h-control)}
.mio-seg-links a{padding:0 14px;font-size:13.5px;gap:6px;grid-auto-flow:column}
.mio-seg-n{font-family:var(--font-anthropic-mono);font-size:11px;line-height:16px;padding:0 6px;border-radius:var(--cds-radius-pill);background:var(--cds-fill-secondary);color:var(--cds-text-primary);font-variant-numeric:tabular-nums}

/* ========== 主体与页头 ========== */
#cgit{flex:1;width:100%;max-width:80rem;margin:0 auto;padding:24px 24px 48px}
.mio-head{margin:0 0 4px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0}
.mio-head h1{margin:0;font-size:1.25rem;line-height:1.75rem;font-weight:600;letter-spacing:-.01em;overflow-wrap:anywhere;min-width:0}
.mio-head h1 a{border-radius:var(--cds-radius-sm,4px)}
.mio-head h1 a:hover{color:var(--cds-accent-text)}
.mio-head-ico{display:inline-grid;place-items:center;color:var(--cds-text-secondary)}
.mio-head-ico svg{width:20px;height:20px}
.mio-head-act{margin-left:auto;display:flex;gap:8px}
.mio-sub{margin:0 0 4px;color:var(--cds-text-secondary)}
#cgit > .mio-head + .content,#cgit > .mio-sub + .content{margin-top:16px}
.mio-repo-head{margin-bottom:8px}

/* 标签栏（MioUI Tabs line：h40、px12、13.5px、图标 16、选中 2px 强调线） */
.mio-tabs{display:flex;align-items:center;gap:4px;margin:0 0 20px;padding:0 0 1px;overflow-x:auto;scrollbar-width:none;
  box-shadow:inset 0 calc(-1 * var(--cds-ring-hairline)) 0 0 var(--cds-border)}
.mio-tabs::-webkit-scrollbar{display:none}
.mio-tabs a{position:relative;display:inline-flex;align-items:center;gap:6px;height:40px;padding:0 12px;border-radius:var(--cds-radius);
  font-size:13.5px;line-height:1.25rem;color:var(--cds-text-secondary);white-space:nowrap;
  transition:color var(--cds-dur-snap) var(--cds-ease-swift),background-color var(--cds-dur-snap) var(--cds-ease-swift)}
.mio-tabs a svg{width:16px;height:16px}
.mio-tabs a:hover{color:var(--cds-text-primary);background:var(--cds-fill-ghost-hover)}
.mio-tabs a.active{color:var(--cds-text-primary);font-weight:500}
.mio-tabs a.active::after{content:'';position:absolute;left:8px;right:8px;bottom:-1px;height:2px;border-radius:var(--cds-radius-pill);background:var(--cds-accent)}
.mio-tabs a.mio-tab-set{margin-left:auto}
@media (pointer:coarse){.mio-tabs a{height:44px}}
.rl-priv-h{align-self:center}

/* 内容区：页面自己排卡片，统一 16px 纵向节奏 */
.content{display:flex;flex-direction:column;gap:16px;min-width:0;animation:message-fade-up var(--cds-dur-sheet) var(--cds-ease-enter) both}
.content > *{margin:0}

/* ========== 按钮（MioUI Button：secondary 默认 / primary / ghost / danger；xs 24 · sm 28 · md 32） ========== */
.mio-btn,input[type=submit]{appearance:none;border:0;margin:0;font:inherit;position:relative;isolation:isolate;display:inline-flex;align-items:center;justify-content:center;gap:6px;
  flex:none;height:var(--cds-h-control-sm);padding:0 10px;border-radius:var(--cds-radius);font-size:12.5px;line-height:1;white-space:nowrap;cursor:pointer;user-select:none;text-decoration:none;
  background:var(--cds-fill-secondary);color:var(--cds-text-primary);-webkit-tap-highlight-color:transparent;
  transition:background-color var(--cds-dur-snap) var(--cds-ease-swift),color var(--cds-dur-snap) var(--cds-ease-swift),transform var(--cds-dur-slow) var(--cds-btn-spring),box-shadow var(--cds-dur-fast) ease-out}
.mio-btn svg{width:14px;height:14px}
.mio-btn:hover,input[type=submit]:hover{background:var(--cds-fill-secondary-hover)}
.mio-btn:not([aria-disabled='true']):active,input[type=submit]:active{transform:scale(var(--cds-btn-press,.975));transition:transform var(--cds-dur-fast) ease-out}
.mio-btn:focus-visible{outline:none;box-shadow:var(--cds-focus-shadow)}
.mio-btn[aria-disabled='true'],.mio-btn:disabled{opacity:.4;cursor:default;pointer-events:none}
.mio-btn-xs{height:var(--cds-h-control-xs);padding:0 8px;font-size:11.5px;gap:4px;border-radius:6px}
.mio-btn-xs svg{width:14px;height:14px}
.mio-btn-md{height:var(--cds-h-control);padding:0 14px;font-size:13.5px;font-weight:500}
.mio-btn-md svg{width:16px;height:16px}
.mio-btn-icon{padding:0;aspect-ratio:1;width:auto}
.mio-btn-icon.mio-btn-xs{width:var(--cds-h-control-xs)}
.mio-btn-icon:not(.mio-btn-xs):not(.mio-btn-md){width:var(--cds-h-control-sm)}
.mio-btn-icon.mio-btn-md{width:var(--cds-h-control)}
.mio-btn-icon svg{width:16px;height:16px}
.mio-btn-secondary{background:var(--cds-fill-secondary);color:var(--cds-text-primary)}
.mio-btn-primary,button.mio-btn-primary{background:var(--cds-accent);color:var(--cds-accent-foreground);font-weight:500}
.mio-btn-primary:hover,button.mio-btn-primary:hover{background:var(--cds-accent-fill-hover)}
.mio-btn-ghost{background:transparent;color:var(--cds-text-secondary)}
.mio-btn-ghost:hover{background:var(--cds-fill-ghost-hover);color:var(--cds-text-primary)}
.mio-btn-ghost:active{background:var(--cds-fill-ghost-selected)}
.mio-btn-danger{background:transparent;color:var(--cds-text-danger)}
.mio-btn-danger:hover{background:color-mix(in srgb,var(--cds-fill-danger) 10%,transparent)}
.mio-btn-danger-solid,button.mio-btn-danger-solid{background:var(--cds-fill-danger-solid);color:#fff;font-weight:500}
.mio-btn-danger-solid:hover{background:color-mix(in oklab,var(--cds-fill-danger-solid) 88%,black)}
.mio-btn-danger-solid:focus-visible{box-shadow:var(--cds-focus-shadow-danger)}
.mio-btn.is-copied{color:var(--cds-text-success)}
@media (pointer:coarse){.mio-btn::after{content:'';position:absolute;top:50%;left:50%;width:max(100%,44px);height:max(100%,44px);transform:translate(-50%,-50%)}}
/* 组合按钮（MioUI ButtonGroup attached：相邻侧直角、1px 缝） */
.mio-btn-group{display:inline-flex;gap:1px;flex:none}
.mio-btn-group > .mio-btn:not(:first-child){border-top-left-radius:0;border-bottom-left-radius:0}
.mio-btn-group > .mio-btn:not(:last-child){border-top-right-radius:0;border-bottom-right-radius:0}
@media (pointer:coarse){.mio-btn-group > .mio-btn::after{width:100%}}

/* 顶栏登录入口 = ghost 按钮 */
.mio-auth{margin:0;display:inline-flex}
a.mio-auth-btn{gap:6px;padding:0 10px;background:transparent;color:var(--cds-text-secondary)}
a.mio-auth-btn:hover{background:var(--cds-fill-ghost-hover);color:var(--cds-text-primary)}
a.mio-auth-btn:active{background:var(--cds-fill-ghost-selected)}
a.mio-auth-btn svg{width:16px;height:16px;display:block}
@media (max-width:420px){a.mio-auth-btn{padding:0;width:var(--cds-h-control-sm)}.mio-auth-l{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}}

/* ========== 徽标（MioUI Badge：h20、px8、11px、500、pill） ========== */
.mio-badge,a.branch-deco,a.tag-deco{display:inline-flex;align-items:center;gap:4px;height:20px;padding:0 8px;border-radius:var(--cds-radius-pill);
  font-size:11px;font-weight:500;line-height:1;white-space:nowrap;vertical-align:middle;flex:none;background:var(--cds-fill-ghost-selected);color:var(--cds-text-secondary)}
.mio-badge svg{width:12px;height:12px}
.mio-badge-neutral{background:var(--cds-fill-ghost-selected);color:var(--cds-text-secondary)}
.mio-badge-accent,a.branch-deco{background:var(--cds-accent-soft);color:var(--cds-accent-text)}
.mio-badge-success{background:color-mix(in srgb,var(--cds-fill-success) 12%,transparent);color:var(--cds-text-success)}
.mio-badge-warning{background:color-mix(in srgb,var(--cds-fill-warning) 15%,transparent);color:var(--cds-text-warning)}
.mio-badge-danger{background:color-mix(in srgb,var(--cds-fill-danger) 12%,transparent);color:var(--cds-text-danger)}
a.tag-deco{background:var(--cds-fill-ghost-selected);color:var(--cds-text-primary)}
a.branch-deco,a.tag-deco{margin-left:6px;font-family:var(--font-anthropic-mono);letter-spacing:-.01em}
a.branch-deco:hover,a.tag-deco:hover{filter:brightness(.97)}
.dark a.branch-deco:hover,.dark a.tag-deco:hover{filter:brightness(1.1)}
.rl-priv{margin-left:8px}

/* ========== 输入（MioUI Input field：surface-3 + 发丝边，h32，焦点环） ========== */
select,input[type=text],input[type=search],input[type=password],input:not([type]){font:inherit;font-size:14px;color:var(--cds-text-primary);
  background:var(--cds-surface-3);border:0;box-shadow:inset 0 0 0 1px var(--cds-border);border-radius:var(--cds-radius);
  height:var(--cds-h-control);padding:0 10px;min-width:0;transition:box-shadow var(--cds-dur-base) var(--cds-ease-swift)}
select:hover,input:hover{box-shadow:inset 0 0 0 1px var(--cds-border-strong)}
select:focus-visible,input:focus-visible{outline:none;box-shadow:var(--cds-focus-shadow)}
::placeholder{color:var(--cds-text-placeholder)}
@media (pointer:coarse){select,input[type=text],input[type=search],input[type=password],input:not([type]){font-size:16px;min-height:44px}}
.mio-input-group{display:flex;align-items:center;gap:6px;height:var(--cds-h-control);padding:0 10px;border-radius:var(--cds-radius);
  background:var(--cds-surface-3);box-shadow:inset 0 0 0 1px var(--cds-border);color:var(--cds-text-secondary);flex:1;min-width:10rem;
  transition:box-shadow var(--cds-dur-base) var(--cds-ease-swift)}
.mio-input-group:hover{box-shadow:inset 0 0 0 1px var(--cds-border-strong)}
.mio-input-group:focus-within{box-shadow:var(--cds-focus-shadow)}
.mio-input-group svg{width:16px;height:16px}
.mio-input-group input{flex:1;height:100%;padding:0;background:transparent;box-shadow:none!important;border-radius:0}
@media (pointer:coarse){.mio-input-group{min-height:44px}}

/* 工具条：筛选/搜索在一行，窄屏换行 */
.mio-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0}
.mio-toolbar > .mio-note{margin:0}
.mio-chips{display:flex;gap:8px;flex-wrap:wrap}
.mio-chip{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 4px 0 10px;border-radius:var(--cds-radius-pill);background:var(--cds-fill-ghost-selected);font-size:13px;max-width:100%}
.mio-chip > svg{width:14px;height:14px;color:var(--cds-text-secondary)}
.mio-chip > span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:var(--font-anthropic-mono);font-size:12.5px}
.mio-chip a{display:inline-grid;place-items:center;width:20px;height:20px;border-radius:5px;color:var(--cds-text-secondary)}
.mio-chip a:hover{background:var(--cds-fill-ghost-selected);color:var(--cds-text-primary)}
.mio-chip a svg{width:12px;height:12px}
.mio-note{font-size:12.5px;line-height:1.5;color:var(--cds-text-secondary)}

/* ========== 卡片（MioUI Card：card 圆角、surface-2、panel 阴影；头部条 surface-1 + 发丝线） ========== */
.mio-card,.gh-card{background:var(--cds-surface-2);border-radius:var(--cds-radius-card);box-shadow:var(--cds-panel-shadow);overflow:hidden;min-width:0}
.gh-card-h{display:flex;align-items:center;gap:8px;min-height:44px;padding:8px 16px;background:var(--cds-surface-1);
  box-shadow:inset 0 calc(-1 * var(--cds-ring-hairline)) 0 0 var(--cds-border);font-weight:500;min-width:0}
.gh-card-h > svg{width:16px;height:16px;color:var(--cds-text-secondary)}
.gh-card-h .mio-badge{font-weight:500}
.gh-count{color:var(--cds-text-secondary);font-weight:400;font-size:13px}
.gh-history{margin-left:auto}
.gh-history b{color:var(--cds-text-primary);font-weight:600;font-variant-numeric:tabular-nums}

/* ========== 仓库代码页（GitHub 信息结构：左 文件+README，右 简介+语言） ========== */
.repo-grid{display:grid;grid-template-columns:minmax(0,1fr) 18rem;grid-template-areas:"main side";gap:24px;align-items:start}
.repo-main{grid-area:main;display:flex;flex-direction:column;gap:16px;min-width:0}
.repo-side{grid-area:side;display:flex;flex-direction:column;min-width:0}
.side-sec{padding:0 0 16px;margin:0 0 16px;box-shadow:inset 0 calc(-1 * var(--cds-ring-hairline)) 0 0 var(--cds-border)}
.side-sec:last-child{box-shadow:none;margin-bottom:0}
.side-sec h2{margin:0 0 8px;font-size:15px;line-height:1.5rem;font-weight:600}
.side-desc{margin:0 0 12px;font-size:14px;line-height:1.5;overflow-wrap:anywhere}
.side-desc.is-empty{color:var(--cds-text-secondary);font-style:italic}
.side-links{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:2px}
.side-links a{display:inline-flex;align-items:center;gap:8px;min-height:28px;color:var(--cds-text-secondary);font-size:13.5px;border-radius:var(--cds-radius-sm,4px)}
.side-links a:hover{color:var(--cds-accent-text)}
.side-links svg{width:16px;height:16px}
.side-k{display:inline-flex;align-items:center;gap:8px;min-height:28px;color:var(--cds-text-secondary);font-size:13.5px;font-variant-numeric:tabular-nums}
.repo-side .mio-clone-field{margin:0 0 8px}
.side-dl{display:flex;gap:8px;flex-wrap:wrap}
.gh-langbar{display:flex;height:8px;border-radius:var(--cds-radius-pill);overflow:hidden;gap:2px;background:var(--cds-fill-ghost-hover)}
.gh-langbar span{display:block;min-width:2px}
.gh-langs ul{list-style:none;margin:12px 0 0;padding:0;display:flex;flex-wrap:wrap;gap:6px 16px;font-size:12.5px;color:var(--cds-text-secondary)}
.gh-langs li{display:inline-flex;align-items:center;gap:6px;font-variant-numeric:tabular-nums}
.gh-langs li i{width:8px;height:8px;border-radius:50%;display:inline-block}
.gh-langs li b{color:var(--cds-text-primary);font-weight:600}

/* 统计行（GitHub 代码页那一行）：分支下拉在最左，后面是 分支/标签/提交，右侧操作 */
.gh-bar{display:flex;align-items:center;gap:8px 12px;flex-wrap:wrap;min-width:0}
.gh-counts{display:flex;align-items:center;gap:4px 16px;flex-wrap:wrap;min-width:0}
.mio-refcount{display:inline-flex;align-items:center;gap:6px;height:var(--cds-h-control-sm);font-size:13px;color:var(--cds-text-secondary);white-space:nowrap;border-radius:var(--cds-radius-sm,4px)}
.mio-refcount svg{width:16px;height:16px}
.mio-refcount b{color:var(--cds-text-primary);font-weight:600;font-variant-numeric:tabular-nums}
.mio-refcount:hover,.mio-refcount:hover b{color:var(--cds-accent-text)}
.gh-bar > .path{flex:1 1 12rem;min-width:0}
.gh-bar-act{margin-left:auto;display:flex;gap:8px}

/* 面包屑（MioUI Breadcrumb：13.5px，次要色链接，悬停下划线，当前项主色 500） */
.mio-bc ol{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;align-items:center;gap:0 2px;font-size:13.5px;line-height:1.25rem;min-width:0}
.mio-bc li{display:flex;align-items:center;min-width:0}
.mio-bc a,.mio-bc span{padding:2px 4px;border-radius:var(--cds-radius-sm,4px);overflow-wrap:anywhere}
.mio-bc a{color:var(--cds-accent-text);font-weight:500}
.mio-bc a:hover{text-decoration:underline;text-underline-offset:4px}
.mio-bc [aria-current]{color:var(--cds-text-primary);font-weight:600}
.mio-bc-sep{color:var(--cds-text-muted);padding:0 1px}

/* 最近提交条 */
.gh-commit{font-weight:400}
.gh-commit .who{font-weight:600;white-space:nowrap}
.gh-commit .msg{color:var(--cds-text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;flex:1}
.gh-commit .msg:hover{color:var(--cds-accent-text)}
.gh-age{margin-left:auto;color:var(--cds-text-secondary);font-size:12.5px;white-space:nowrap;display:flex;gap:6px;align-items:center;font-variant-numeric:tabular-nums}
.gh-age a{font-size:12px}
.gh-age a:hover{color:var(--cds-accent-text)}
.gh-dot{color:var(--cds-text-muted)}

/* ========== 表格（MioUI Table：th 12.5px 500 次要色；行 hover ghost；行线发丝） ========== */
table{border-collapse:collapse;width:100%}
table.list th{text-align:left;font-weight:500;font-size:12.5px;color:var(--cds-text-secondary);background:var(--cds-surface-1);padding:10px 16px;white-space:nowrap;
  box-shadow:inset 0 calc(-1 * var(--cds-ring-hairline)) 0 0 var(--cds-border)}
table.list td{padding:9px 16px;box-shadow:inset 0 var(--cds-ring-hairline) 0 0 var(--cds-border);vertical-align:middle}
table.list tr:first-child td,table.list thead + tbody tr:first-child td{box-shadow:none}
table.list tbody tr,table.list tr{transition:background-color var(--cds-dur-snap) var(--cds-ease-swift)}
table.list tr:hover td{background:var(--cds-fill-ghost-hover)}
table.list th.num,table.list td.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.tbl-scroll{overflow-x:auto;position:relative}
table.gh-files td:first-child{width:100%;max-width:0}
.ls-dir,.ls-blob,.ls-sub{display:inline-flex;align-items:center;gap:10px;min-width:0;max-width:100%;color:var(--cds-text-primary)}
.ls-dir span,.ls-blob span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ls-dir svg,.ls-blob svg,.ls-sub svg{width:16px;height:16px;color:var(--cds-text-secondary)}
.ls-dir svg{color:var(--cds-accent)}
.ls-dir:hover span,.ls-blob:hover span{color:var(--cds-accent-text);text-decoration:underline;text-underline-offset:3px}
.gh-size{text-align:right;color:var(--cds-text-secondary);font-family:var(--font-anthropic-mono);font-size:12px;font-variant-numeric:tabular-nums;white-space:nowrap}
span[class^='age-']{color:var(--cds-text-secondary);font-variant-numeric:tabular-nums;white-space:nowrap}

/* ========== 提交列表 / 分支 / 标签（MioUI 列表卡：行 12×16，主文字 + 次要元信息 + 右侧操作） ========== */
.cl-day{display:flex;flex-direction:column;gap:8px}
.cl-day-h{display:flex;align-items:center;gap:8px;margin:0;font-size:13px;font-weight:500;color:var(--cds-text-secondary)}
.cl-day-h svg{width:16px;height:16px}
.cl-list{list-style:none;margin:0;padding:0}
.cl-row{display:flex;align-items:center;gap:12px;padding:12px 16px;box-shadow:inset 0 var(--cds-ring-hairline) 0 0 var(--cds-border);transition:background-color var(--cds-dur-snap) var(--cds-ease-swift)}
.cl-row:first-child{box-shadow:none}
.cl-row:hover{background:var(--cds-fill-ghost-hover)}
.cl-main{flex:1;min-width:0}
.cl-subj{font-weight:600;overflow-wrap:anywhere}
.cl-subj:hover,.rf-name:hover span{color:var(--cds-accent-text)}
.cl-meta{margin-top:2px;font-size:12.5px;color:var(--cds-text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cl-meta b{color:var(--cds-text-primary);font-weight:500}
.cl-meta a:hover{color:var(--cds-accent-text)}
.cl-act{display:flex;align-items:center;gap:4px;flex:none}
.cl-act .mono{font-size:12px}
.cl-sha .mio-btn{background:var(--cds-fill-ghost-hover)}
.cl-sha .mio-btn:hover{background:var(--cds-fill-secondary)}
.rf-name{display:inline-flex;align-items:center;gap:6px;font-weight:600;font-size:13px;vertical-align:middle;max-width:100%}
.rf-name svg{width:16px;height:16px;color:var(--cds-text-secondary)}
.rf-name span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rf-name + .mio-badge{margin-left:8px}

/* 分页（MioUI Pagination simple：上一页 / 第 n 页 / 下一页） */
.mio-pager{display:flex;align-items:center;justify-content:center;gap:8px}
.mio-pager-n{font-size:13.5px;color:var(--cds-text-secondary);font-variant-numeric:tabular-nums;padding:0 8px}

/* ========== 空状态（MioUI EmptyState） ========== */
.mio-empty{display:flex;flex-direction:column;align-items:center;gap:8px;padding:40px 24px;text-align:center;
  background:var(--cds-surface-2);border-radius:var(--cds-radius-card);box-shadow:var(--cds-panel-shadow)}
.mio-empty.is-bare{background:none;box-shadow:none;border-radius:0}
.mio-empty-ico{margin-bottom:4px;color:var(--cds-text-secondary);display:grid;place-items:center}
.mio-empty-ico svg{width:30px;height:30px}
.mio-empty h3{margin:0;font-size:1rem;line-height:1.5rem;font-weight:500;color:var(--cds-text-primary)}
.mio-empty p{margin:0;max-width:24rem;font-size:14px;color:var(--cds-text-secondary);overflow-wrap:anywhere}
.mio-empty code{font-size:12.5px;padding:2px 6px;border-radius:6px;background:var(--cds-fill-secondary);color:var(--cds-text-primary)}
.mio-empty-act{margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;justify-content:center}
.mio-cmd{position:relative;margin-top:8px;width:min(100%,36rem);text-align:left}
.mio-cmd pre{margin:0;padding:12px 44px 12px 14px;border-radius:var(--cds-radius-code);background:var(--cds-surface-1);box-shadow:inset 0 0 0 1px var(--cds-border);
  font-size:12.5px;line-height:1.6;overflow-x:auto;white-space:pre}
.mio-cmd .mio-btn{position:absolute;top:8px;right:8px}
.error{color:var(--cds-text-danger)}

/* ========== 文件查看 ========== */
.blob-info{flex-wrap:wrap;row-gap:6px}
.blob-meta{display:inline-flex;align-items:center;gap:6px;color:var(--cds-text-secondary);font-weight:400;font-size:12.5px;font-variant-numeric:tabular-nums}
.blob-act{margin-left:auto;display:flex;align-items:center;gap:4px}
.blob-scroll{overflow-x:auto;position:relative}
table.blob{font-family:var(--font-anthropic-mono);font-size:12.5px;line-height:1.25rem;width:100%}
table.blob td{padding:0;vertical-align:top}
table.blob pre{margin:0;padding:12px 0}
td.linenumbers{width:1%;text-align:right;user-select:none;background:var(--cds-surface-1);box-shadow:inset calc(-1 * var(--cds-ring-hairline)) 0 0 var(--cds-border)}
td.linenumbers pre{padding:12px 12px 12px 16px!important;color:var(--cds-text-placeholder);font-variant-numeric:tabular-nums}
td.linenumbers a{color:inherit}
td.linenumbers a:hover{color:var(--cds-accent-text)}
td.linenumbers a:target{color:var(--cds-accent-text);font-weight:600}
td.lines pre{padding:12px 16px!important}
table.blame td.sha1{white-space:nowrap;padding:12px 16px;color:var(--cds-text-secondary);font-size:12px;box-shadow:inset 0 var(--cds-ring-hairline) 0 0 var(--cds-border);font-family:var(--cds-font-body)}
table.blame tr:first-child td.sha1{box-shadow:none}
table.blame td.sha1 .mono{color:var(--cds-accent-text);margin-right:8px}
.bl-who{margin-right:8px;color:var(--cds-text-primary)}
.blob-img{display:grid;place-items:center;padding:24px;background:var(--cds-surface-1)}
.blob-img img{max-width:100%;max-height:70vh;border-radius:var(--cds-radius);box-shadow:0 0 0 1px var(--cds-border)}
span.hl-c{color:var(--cds-text-secondary);font-style:italic}
span.hl-s{color:var(--cds-text-success)}
span.hl-k{color:var(--cds-accent-text);font-weight:500}
span.hl-n{color:var(--cds-text-warning)}

/* ========== 提交详情 / 差异（MioUI DiffViewer：success/danger 10% 淡底、行号 tabular、文件头 h40） ========== */
.cm-card{display:flex;flex-direction:column}
.cm-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:16px 16px 0}
.cm-title{margin:0;flex:1 1 16rem;min-width:0;font-size:1rem;line-height:1.5rem;font-weight:600;overflow-wrap:anywhere;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.cm-title svg{width:18px;height:18px;color:var(--cds-text-secondary)}
.cm-title a{color:var(--cds-accent-text)}
.cm-browse{margin-left:auto}
.cm-body{margin:8px 16px 0;white-space:pre-wrap;overflow-wrap:anywhere;font-family:var(--cds-font-body);font-size:13.5px;line-height:1.55;color:var(--cds-text-secondary)}
.cm-meta{display:flex;align-items:center;justify-content:space-between;gap:8px 16px;flex-wrap:wrap;margin-top:16px;padding:10px 16px;background:var(--cds-surface-1);
  box-shadow:inset 0 var(--cds-ring-hairline) 0 0 var(--cds-border);font-size:12.5px;color:var(--cds-text-secondary)}
.cm-who b{color:var(--cds-text-primary);font-weight:600}
.cm-ids{display:flex;align-items:center;gap:4px 12px;flex-wrap:wrap;font-variant-numeric:tabular-nums}
.cm-ids code,.cm-ids .mono{font-size:12px;color:var(--cds-text-primary)}
.cm-ids a.mono{color:var(--cds-accent-text)}
.cm-subj{color:var(--cds-text-secondary)}
.cm-foot{display:flex;gap:4px;padding:8px 12px;box-shadow:inset 0 var(--cds-ring-hairline) 0 0 var(--cds-border)}
.df-summary{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:13px;color:var(--cds-text-secondary);font-variant-numeric:tabular-nums}
.df-summary-act{margin-left:auto;display:flex;gap:4px;flex-wrap:wrap}
.add{color:var(--cds-text-success);font-weight:600}
.del{color:var(--cds-text-danger);font-weight:600}
.df-h{display:flex;align-items:center;gap:10px;min-height:40px;padding:6px 16px;background:var(--cds-surface-1);cursor:pointer;list-style:none;user-select:none;
  transition:background-color var(--cds-dur-snap) var(--cds-ease-swift)}
.df-h::-webkit-details-marker{display:none}
.df-h:hover{background:var(--cds-fill-ghost-hover)}
.df-h > svg{width:14px;height:14px;color:var(--cds-text-secondary);transition:transform var(--cds-dur-snap) var(--cds-ease-snap)}
details.df-file[open] > .df-h{box-shadow:inset 0 calc(-1 * var(--cds-ring-hairline)) 0 0 var(--cds-border)}
details.df-file[open] > .df-h > svg{transform:rotate(90deg)}
.df-h:focus-visible{border-radius:0;box-shadow:inset 0 0 0 2px var(--cds-focus-ring)}
.df-stat{display:inline-flex;gap:6px;font-family:var(--font-anthropic-mono);font-size:12px;font-variant-numeric:tabular-nums;flex:none}
.df-path{font-family:var(--font-anthropic-mono);font-size:12.5px;min-width:0;overflow-wrap:anywhere}
.df-note{padding:16px;color:var(--cds-text-secondary);font-size:13px}
.df-scroll{overflow-x:auto;position:relative}
table.df{font-family:var(--font-anthropic-mono);font-size:12.5px;line-height:1.65;width:100%}
table.df td{padding:0;vertical-align:top}
td.df-n{width:1%;min-width:3rem;padding:0 8px!important;text-align:right;color:var(--cds-text-placeholder);user-select:none;font-variant-numeric:tabular-nums;white-space:nowrap}
td.df-c{white-space:pre;padding:0 16px 0 4px!important}
.df-sign{display:inline-block;width:1.25em;user-select:none;color:var(--cds-text-secondary)}
tr.df-add > td{background:color-mix(in srgb,var(--cds-fill-success) 10%,transparent)}
tr.df-del > td{background:color-mix(in srgb,var(--cds-fill-danger) 10%,transparent)}
tr.df-add .df-sign{color:var(--cds-text-success)}
tr.df-del .df-sign{color:var(--cds-text-danger)}
tr.df-hunk > td{background:var(--cds-fill-ghost-hover);color:var(--cds-text-secondary);padding-top:4px!important;padding-bottom:4px!important}

/* ========== 统计页 ========== */
table.stats td.name{font-weight:500}
tr.st-total td{font-weight:600;background:var(--cds-surface-1)}

/* ========== Markdown ========== */
.md{padding:8px 32px 28px;line-height:1.7;font-size:.9375rem;overflow-wrap:anywhere}
.md h1,.md h2{padding-bottom:.3em;box-shadow:inset 0 calc(-1 * var(--cds-ring-hairline)) 0 0 var(--cds-border)}
.md h1{font-size:1.75rem;line-height:1.3;margin:24px 0 16px;font-weight:600}
.md h2{font-size:1.35rem;line-height:1.35;margin:28px 0 14px;font-weight:600}
.md h3{font-size:1.1rem;margin:22px 0 10px;font-weight:600}
.md a{color:var(--cds-accent-text);text-decoration:underline;text-decoration-color:color-mix(in srgb,currentColor 35%,transparent);text-underline-offset:3px}
.md pre{background:var(--cds-code-bg);color:var(--cds-gray-60);border-radius:var(--cds-radius-code);padding:14px 16px;overflow:auto;font-size:12.5px;line-height:1.6}
html:not(.dark) .md pre{background:var(--cds-surface-1);color:var(--cds-text-primary);box-shadow:inset 0 0 0 1px var(--cds-border)}
.md pre code{background:none!important;padding:0;box-shadow:none}
.md :not(pre)>code{font-size:.85em;padding:.15em .4em;border-radius:6px;background:var(--cds-fill-secondary)}
.md blockquote{margin:0;padding:0 16px;color:var(--cds-text-secondary);box-shadow:inset 3px 0 0 0 var(--cds-border-strong)}
.md table{width:auto;margin:12px 0;display:block;overflow-x:auto}
.md th,.md td{padding:6px 12px;box-shadow:inset 0 0 0 var(--cds-ring-hairline) var(--cds-border)}
.md img{max-width:100%;border-radius:var(--cds-radius)}
.md hr{border:0;height:var(--cds-ring-hairline);background:var(--cds-border)}
.gh-pre{margin:0;padding:16px;white-space:pre-wrap;font-size:12.5px;overflow-wrap:anywhere}

/* ========== 编辑器 ========== */
.ed-form{display:flex;flex-direction:column;margin:0}
.ed-head{font-weight:400;font-size:13px;color:var(--cds-text-secondary)}
.ed-file{font-family:var(--font-anthropic-mono);color:var(--cds-text-primary);overflow-wrap:anywhere;min-width:0}
.ed-head .mio-badge{margin-left:auto}
.ed-text{display:block;width:100%;min-height:60vh;margin:0;resize:vertical;border:0;border-radius:0;padding:12px 16px;
  font:13px/1.55 var(--font-anthropic-mono);tab-size:4;color:var(--cds-text-primary);background:var(--cds-surface-2);white-space:pre;overflow:auto;
  box-shadow:inset 0 calc(-1 * var(--cds-ring-hairline)) 0 0 var(--cds-border)}
.ed-text:focus-visible{outline:none;box-shadow:inset 0 0 0 2px var(--cds-focus-ring)}
.ed-commit{display:flex;flex-direction:column;gap:12px;padding:16px;background:var(--cds-surface-1)}
.ed-actions{display:flex;justify-content:flex-end;gap:8px}

/* ========== 页脚 ========== */
.mio-foot{padding:20px 0 28px;color:var(--cds-text-hint);font-size:12px}
.mio-foot-in{display:flex;align-items:center;justify-content:space-between;gap:8px 24px;flex-wrap:wrap}
.mio-friends{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:4px 18px}
.mio-friends a{color:var(--cds-text-secondary);text-decoration:none;padding:2px 0;border-radius:var(--cds-radius-sm,4px);transition:color var(--cds-dur-base) var(--cds-ease-swift)}
.mio-friends a:hover{color:var(--cds-text-primary);text-decoration:underline;text-underline-offset:3px}
@media (max-width:640px){.mio-foot{padding:16px 0 calc(24px + env(safe-area-inset-bottom))}.mio-foot-in{flex-direction:column-reverse;justify-content:center;gap:10px}.mio-friends{justify-content:center;gap:2px 20px}.mio-friends a{padding:4px 0;font-size:13px}}

/* ========== 对话框（MioUI Dialog：16px 圆角、popover 阴影、模糊遮罩、头/体/脚，体内滚动 + 渐隐；sm 400 · md 520 · lg 720） ========== */
html:has([data-dialog-layer]){overflow:hidden}
.mio-behind{pointer-events:none;user-select:none}
.mio-dialog-layer{position:fixed;inset:0;z-index:100;display:grid;place-items:center;padding:max(1rem,env(safe-area-inset-top,0px)) 1rem}
.mio-backdrop{position:absolute;inset:0;background:var(--cds-backdrop);backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px);animation:mio-fade var(--cds-dur-base) ease-out both;cursor:default}
.mio-backdrop:focus-visible{box-shadow:none}
.mio-dialog{position:relative;width:100%;max-width:520px;max-height:var(--environment-dialog-cap,calc(100dvh - 2rem));margin:0;
  display:flex;flex-direction:column;overflow:hidden;text-align:left;
  background:var(--cds-surface-popover);border-radius:var(--cds-radius-dialog);box-shadow:var(--cds-shadow-popover);
  animation:mio-dialog-in var(--cds-dur-base) var(--cds-ease-out) both}
.mio-dialog-sm{max-width:400px}
.mio-dialog-md{max-width:520px}
.mio-dialog-lg{max-width:720px}
.mio-dialog-h{flex:none;display:flex;flex-direction:column;gap:6px;padding:20px 48px 4px 24px}
.mio-dialog-icon{width:40px;height:40px;margin-bottom:6px;border-radius:50%;display:grid;place-items:center;background:var(--cds-accent-soft);color:var(--cds-accent-text)}
.mio-dialog-icon svg{width:20px;height:20px}
.mio-dialog-icon.is-danger{color:var(--cds-text-danger);background:color-mix(in srgb,var(--cds-fill-danger) 12%,transparent)}
.mio-dialog h2{margin:0;font-size:17px;line-height:1.5rem;font-weight:600;color:var(--cds-text-primary)}
.mio-dialog-h p{margin:0;color:var(--cds-text-secondary);font-size:13.5px;line-height:1.25rem}
.mio-dialog-x{position:absolute;top:12px;right:12px}
.mio-dialog-b{flex:1 1 auto;min-height:0;overflow-y:auto;padding:12px 24px 20px;display:flex;flex-direction:column;gap:16px}
.mio-dialog-b:has(+ .mio-dialog-f){padding-bottom:8px}
.mio-dialog-f{flex:none;display:flex;justify-content:flex-end;gap:8px;padding:12px 24px 20px}
.mio-dialog h3{margin:0;font-size:13.5px;line-height:1.25rem;font-weight:600;color:var(--cds-text-primary)}
.mio-dialog-err{background:color-mix(in srgb,var(--cds-fill-danger) 10%,transparent);color:var(--cds-text-danger);border-radius:var(--cds-radius);padding:8px 12px;font-size:13px}
.mio-dialog-ok{background:var(--cds-accent-soft);color:var(--cds-accent-text);border-radius:var(--cds-radius);padding:8px 12px;font-size:13px}
.dlg-sec{display:flex;flex-direction:column;gap:12px;margin:0}
.dlg-sec + .dlg-sec{padding-top:16px;box-shadow:inset 0 var(--cds-ring-hairline) 0 0 var(--cds-border)}
.dlg-sec-f{display:flex;align-items:flex-end;justify-content:space-between;gap:12px}
.dlg-sec-f .mio-note{margin:0;flex:1;min-width:0}
@keyframes mio-fade{from{opacity:0}to{opacity:1}}
@keyframes mio-dialog-in{from{opacity:0;transform:scale(.95)}to{opacity:1;transform:none}}
@media (max-width:640px){
  .mio-dialog-layer{place-items:end center;padding:0}
  .mio-dialog{max-width:none!important;border-radius:var(--cds-radius-dialog) var(--cds-radius-dialog) 0 0;max-height:calc(100dvh - 2rem);padding-bottom:env(safe-area-inset-bottom)}
  .mio-dialog-h{padding:20px 48px 4px 20px}.mio-dialog-b{padding:12px 20px 16px}.mio-dialog-f{padding:12px 20px 16px;flex-direction:column-reverse}
  .mio-dialog-f .mio-btn{width:100%}
  .dlg-sec-f{flex-direction:column;align-items:stretch}
}

/* 表单字段（MioUI Field：标签 12.5px 500 次要色，输入 h40 / 16px） */
.mio-field{display:flex;flex-direction:column;gap:6px;font-size:12.5px;font-weight:500;color:var(--cds-text-secondary);min-width:0}
.mio-field :is(input,select,textarea){font:inherit;font-weight:400;font-size:15px;color:var(--cds-text-primary);background:var(--cds-surface-3);border:0;box-shadow:inset 0 0 0 1px var(--cds-border);
  border-radius:var(--cds-radius);height:var(--cds-h-control-lg);padding:0 12px;width:100%;transition:box-shadow var(--cds-dur-base) var(--cds-ease-swift)}
.mio-field textarea{height:auto;min-height:72px;padding:8px 12px;resize:vertical}
.mio-field :is(input,select,textarea):hover{box-shadow:inset 0 0 0 1px var(--cds-border-strong)}
.mio-field :is(input,select,textarea):focus-visible{outline:none;box-shadow:var(--cds-focus-shadow)}
.mio-field input[aria-invalid=true]{box-shadow:var(--cds-focus-shadow-danger)}
@media (pointer:coarse){.mio-field :is(input,select,textarea){font-size:16px}}
.mio-row{display:flex;gap:8px;align-items:flex-end}
.mio-row > .mio-field{flex:1;min-width:0}
.mio-row > .mio-field.mio-narrow{flex:0 0 9rem}
.mio-check{display:inline-flex;align-items:center;gap:8px;align-self:flex-start;font-size:13.5px;color:var(--cds-text-secondary);cursor:pointer;user-select:none;-webkit-tap-highlight-color:transparent;min-height:24px}
.mio-check input{appearance:none;-webkit-appearance:none;margin:0;flex:none;width:16px;height:16px;border-radius:4px;background:var(--cds-surface-3);box-shadow:inset 0 0 0 1px var(--cds-border-strong);cursor:pointer;display:grid;place-content:center;transition:background-color var(--cds-dur-base) var(--cds-ease-swift),box-shadow var(--cds-dur-base) var(--cds-ease-swift)}
.mio-check input::after{content:"";width:9px;height:5px;border:solid var(--cds-accent-foreground);border-width:0 0 2px 2px;transform:translateY(-1px) rotate(-45deg) scale(0);transition:transform var(--cds-dur-base) var(--cds-ease-swift)}
.mio-check input:checked{background:var(--cds-accent);box-shadow:none}
.mio-check input:checked::after{transform:translateY(-1px) rotate(-45deg) scale(1)}
.mio-check:hover input:not(:checked){box-shadow:inset 0 0 0 1px var(--cds-alpha-4)}
.mio-check input:focus-visible{outline:none;box-shadow:var(--cds-focus-shadow)}

/* 令牌表 */
.tk-wrap{overflow-x:auto;position:relative;margin:0 -4px}
table.tk{width:100%;min-width:420px;font-size:13px}
table.tk th{text-align:left;font-weight:500;font-size:12.5px;color:var(--cds-text-secondary);padding:6px 4px;white-space:nowrap}
table.tk td{padding:8px 4px;box-shadow:inset 0 var(--cds-ring-hairline) 0 0 var(--cds-border);vertical-align:middle}
table.tk td.tk-name{font-weight:500;overflow-wrap:anywhere}
table.tk td.tk-t{color:var(--cds-text-secondary);font-family:var(--font-anthropic-mono);font-size:12px;font-variant-numeric:tabular-nums;white-space:nowrap}
table.tk td.tk-act{text-align:right;white-space:nowrap}
.tk-role{display:inline-flex;align-items:center;height:20px;white-space:nowrap;font-size:11px;padding:0 8px;border-radius:var(--cds-radius-pill);font-weight:500;background:var(--cds-fill-ghost-selected);color:var(--cds-text-primary)}
.tk-role[data-role=admin]{background:var(--cds-accent-soft);color:var(--cds-accent-text)}
.tk-role[data-role=reader]{color:var(--cds-text-secondary)}
.tk-empty{color:var(--cds-text-secondary);font-size:13px;padding:8px 0}
.tk-secret{display:flex;gap:8px;align-items:center}
.tk-secret input{flex:1;min-width:0;height:var(--cds-h-control);font-family:var(--font-anthropic-mono)!important;font-size:13px!important}
.tk-sub{display:none}
.tk-exp.is-expired{display:inline-flex;align-items:center;height:20px;white-space:nowrap;font-family:var(--cds-font-body);font-size:11px;padding:0 8px;border-radius:var(--cds-radius-pill);font-weight:500;
  background:color-mix(in srgb,var(--cds-fill-danger) 12%,transparent);color:var(--cds-text-danger)}
table.tk tr.is-expired td.tk-name > span:first-child{color:var(--cds-text-secondary)}
.tk-reveal{padding:16px;border-radius:var(--cds-radius-card);background:var(--cds-accent-soft)}
@media (max-width:640px){.mio-row{flex-direction:column;align-items:stretch}.mio-row > .mio-field.mio-narrow{flex:1}
  table.tk{min-width:0}table.tk :is(th,td):is(.tk-c,.tk-e,.tk-used){display:none}
  .tk-sub{display:block;margin-top:2px;font-weight:400;font-size:11.5px;color:var(--cds-text-secondary);font-family:var(--font-anthropic-mono);font-variant-numeric:tabular-nums}}

/* ========== 仓库列表（首页 / 管理台） ========== */
.rl-bar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.rl-count{color:var(--cds-text-secondary);font-size:13px;font-variant-numeric:tabular-nums}
ul.repo-list{list-style:none;margin:0;padding:0;background:var(--cds-surface-2);border-radius:var(--cds-radius-card);box-shadow:var(--cds-panel-shadow);overflow:hidden}
ul.repo-list li{position:relative;display:grid;grid-template-columns:minmax(0,1fr) auto;grid-template-areas:"name meta" "desc meta";column-gap:16px;row-gap:2px;padding:12px 16px;
  box-shadow:inset 0 var(--cds-ring-hairline) 0 0 var(--cds-border);align-items:center;transition:background-color var(--cds-dur-snap) var(--cds-ease-swift)}
ul.repo-list li:first-child{box-shadow:none}
ul.repo-list li:hover{background:var(--cds-fill-ghost-hover)}
.rl-name::after{content:'';position:absolute;inset:0}
.rl-name{grid-area:name;font-weight:600;color:var(--cds-text-primary);overflow-wrap:anywhere}
.rl-name:hover{color:var(--cds-accent-text)}
.rl-desc{grid-area:desc;margin:0;color:var(--cds-text-secondary);font-size:13px;line-height:1.45;overflow-wrap:anywhere}
.rl-meta{grid-area:meta;display:flex;align-items:center;gap:16px;font-size:12px;color:var(--cds-text-secondary);white-space:nowrap}
.rl-lang{display:inline-flex;align-items:center;gap:6px;color:var(--cds-text-primary)}
.rl-lang i{width:10px;height:10px;border-radius:50%;display:inline-block;box-shadow:inset 0 0 0 1px var(--cds-border)}
.rl-meta time,.rl-size{font-variant-numeric:tabular-nums}

/* ========== 存储卡（MioUI Stat 组：四格等宽、竖向发丝分隔；标签次要色 / 数值 tabular / 用量） ========== */
.st-panel{background:var(--cds-surface-2);border-radius:var(--cds-radius-card);box-shadow:var(--cds-panel-shadow);margin:0 0 8px;overflow:visible}
.st-head{display:flex;align-items:center;justify-content:space-between;gap:8px 16px;flex-wrap:wrap;padding:14px 20px;box-shadow:inset 0 calc(-1 * var(--cds-ring-hairline)) 0 0 var(--cds-border)}
.st-panel h2{margin:0;font-size:15px;line-height:1.5rem;font-weight:600;color:var(--cds-text-primary);display:inline-flex;align-items:center;gap:8px}
.st-total{display:inline-flex;align-items:center;gap:6px;font-size:13px;color:var(--cds-text-secondary);font-variant-numeric:tabular-nums}
.st-total b{color:var(--cds-text-primary);font-weight:600}
.st-num{font-variant-numeric:tabular-nums;white-space:nowrap}
.st-rings{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(10rem,1fr))}
.st-ring-item{display:flex;flex-direction:column;gap:4px;padding:16px 20px;min-width:0;box-shadow:inset var(--cds-ring-hairline) 0 0 0 var(--cds-border)}
.st-ring-item:first-child{box-shadow:none}
.st-ring-k{font-size:13px;color:var(--cds-text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.st-ring-row{display:flex;align-items:center;justify-content:space-between;gap:12px}
.st-ring-v{font-size:24px;line-height:2rem;font-weight:500;color:var(--cds-text-primary);font-variant-numeric:tabular-nums;white-space:nowrap}
.st-ring{width:36px;height:36px;flex:none;transform:rotate(-90deg)}
.st-ring circle{fill:none;stroke-width:4}
.st-ring-track{stroke:var(--cds-fill-secondary)}
.st-ring-val{stroke:var(--cds-accent);stroke-linecap:round}
.st-warn .st-ring-val{stroke:var(--cds-fill-warning)}
.st-over .st-ring-val{stroke:var(--cds-fill-danger-solid)}
.st-ring-sub{font-size:12px;color:var(--cds-text-secondary);font-variant-numeric:tabular-nums;white-space:nowrap}
.st-warn .st-ring-v{color:var(--cds-text-warning)}
.st-over .st-ring-v{color:var(--cds-text-danger)}
.st-help{position:relative;display:inline-block}
.st-help summary{list-style:none;cursor:pointer;width:18px;height:18px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:11.5px;font-weight:600;color:var(--cds-text-secondary);background:var(--cds-fill-secondary)}
.st-help summary::-webkit-details-marker{display:none}
.st-help summary:hover,.st-help[open] summary{color:var(--cds-accent-foreground);background:var(--cds-accent)}
.st-help summary:focus-visible{outline:none;box-shadow:var(--cds-focus-shadow)}
.st-pop{position:absolute;left:0;top:26px;z-index:20;width:min(340px,80vw);max-height:70vh;overflow-y:auto;background:var(--cds-surface-popover);border-radius:var(--cds-radius-card);box-shadow:var(--cds-shadow-popover);padding:12px 14px;font-size:12.5px;font-weight:400;line-height:1.55;color:var(--cds-text-primary)}
.st-pop b{display:block;margin:0 0 4px;font-size:13px}
.st-pop ul{margin:0 0 10px;padding-left:16px;color:var(--cds-text-secondary)}
.st-pop ul:last-child{margin-bottom:0}
.st-pop li+li{margin-top:3px}
.st-pop ul.st-facts{list-style:none;padding:0}
.st-facts li{display:flex;justify-content:space-between;gap:12px}
.st-facts li > :last-child{color:var(--cds-text-primary)}
.st-facts a{color:var(--cds-text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.st-facts a:hover{color:var(--cds-accent-text)}
@media (max-width:640px){
  .st-head{padding:12px 16px}
  .st-rings{grid-template-columns:repeat(2,minmax(0,1fr))}
  .st-ring-item{padding:12px 16px;box-shadow:inset var(--cds-ring-hairline) 0 0 0 var(--cds-border),inset 0 var(--cds-ring-hairline) 0 0 var(--cds-border)}
  .st-ring-item:nth-child(odd){box-shadow:inset 0 var(--cds-ring-hairline) 0 0 var(--cds-border)}
  .st-ring-item:nth-child(-n+2){box-shadow:inset var(--cds-ring-hairline) 0 0 0 var(--cds-border)}
  .st-ring-item:first-child{box-shadow:none}
  .st-ring-v{font-size:20px;line-height:1.75rem}
  .st-ring{width:32px;height:32px}
}

/* ========== 仓库设置页（MioUI SettingsCenter：左导航 + 分区面板） ========== */
.rs-page{display:grid;grid-template-columns:200px minmax(0,1fr);gap:24px;align-items:start}
.rs-nav ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:2px}
.rs-nav a{display:flex;align-items:center;gap:8px;min-height:36px;padding:0 12px;border-radius:var(--cds-radius);color:var(--cds-text-secondary);font-size:13.5px;white-space:nowrap;
  transition:color var(--cds-dur-snap) var(--cds-ease-swift),background-color var(--cds-dur-snap) var(--cds-ease-swift)}
.rs-nav a svg{width:18px;height:18px}
.rs-nav a:hover{background:var(--cds-fill-ghost-hover);color:var(--cds-text-primary)}
.rs-nav a[aria-current=page]{background:var(--cds-fill-ghost-selected);color:var(--cds-text-primary);font-weight:500}
.rs-nav a.is-danger,.rs-nav a.is-danger:hover{color:var(--cds-text-danger)}
.rs-main{min-width:0;display:flex;flex-direction:column;gap:16px}
.rs-panel{background:var(--cds-surface-2);border-radius:var(--cds-radius-card);box-shadow:var(--cds-panel-shadow);padding:20px;display:flex;flex-direction:column;gap:16px;margin:0}
.rs-panel-h h2{margin:0 0 4px;font-size:15px;line-height:1.5rem;font-weight:600;color:var(--cds-text-primary)}
.rs-panel-h .mio-note{margin:0}
.rs-panel-h .mio-badge{margin-left:4px}
.rs-note{margin:-6px 0 0}
.rs-actions{display:flex;justify-content:flex-end;gap:8px;padding-top:4px}
.rs-danger{box-shadow:0 0 0 1px color-mix(in srgb,var(--cds-fill-danger) 40%,transparent),var(--cds-shadow-sm)}
.rs-danger .rs-panel-h h2{color:var(--cds-text-danger)}
#cgit .content > .ad-notice{margin:0}
@media (max-width:719px){
  .rs-page{grid-template-columns:minmax(0,1fr);gap:12px}
  .rs-nav{overflow-x:auto;scrollbar-width:none;margin:0 -2px;padding:2px}
  .rs-nav ul{flex-direction:row;gap:4px}
  .rs-nav a{min-height:44px;padding:0 14px}
  .rs-panel{padding:16px}
  .rs-actions .mio-btn{flex:1}
}

/* ========== 下拉菜单（MioUI DropdownMenu：12px 面板 + 4px 内边距 → 32px 菜单项，popover 阴影）；<details>，无内联脚本 ========== */
.mio-menu{position:relative;display:inline-flex;flex:none}
.mio-menu > summary{list-style:none}
.mio-menu > summary::-webkit-details-marker{display:none}
.mio-menu-btn{display:inline-flex;align-items:center;gap:6px;height:var(--cds-h-control-sm);padding:0 8px 0 10px;border-radius:var(--cds-radius);
  font-size:12.5px;line-height:1;color:var(--cds-text-primary);cursor:pointer;user-select:none;white-space:nowrap;-webkit-tap-highlight-color:transparent;
  transition:background-color var(--cds-dur-snap) var(--cds-ease-swift),color var(--cds-dur-base) var(--cds-ease-swift),box-shadow var(--cds-dur-base) var(--cds-ease-swift)}
.mio-menu-btn svg{width:16px;height:16px;display:block}
.mio-menu-btn > svg:last-child{width:12px;height:12px;color:currentColor;opacity:.7;transition:transform var(--cds-dur-snap) var(--cds-ease-snap)}
.mio-menu[open] > .mio-menu-btn > svg:last-child{transform:rotate(180deg)}
.mio-menu-btn:focus-visible{outline:none;box-shadow:var(--cds-focus-shadow)}
@media (pointer:coarse){.mio-menu-btn{min-height:44px}}
.mio-acct-btn{color:var(--cds-text-secondary)}
.mio-acct-btn:hover,.mio-acct[open] > .mio-acct-btn{background:var(--cds-fill-ghost-hover);color:var(--cds-text-primary)}
/* 分支按钮 = secondary 按钮（柔和填充，无边框） */
.mio-ref > .mio-menu-btn{background:var(--cds-fill-secondary);font-weight:500}
.mio-ref > .mio-menu-btn:hover,.mio-ref[open] > .mio-menu-btn{background:var(--cds-fill-secondary-hover)}
.mio-ref > .mio-menu-btn > svg:first-child{color:var(--cds-text-secondary)}
.mio-ref-name{max-width:14rem;overflow:hidden;text-overflow:ellipsis;font-family:var(--font-anthropic-mono);font-size:12.5px}
/* Code 菜单按钮 = primary */
.mio-clone > .mio-menu-btn{background:var(--cds-accent);color:var(--cds-accent-foreground);font-weight:500;padding:0 8px 0 10px}
.mio-clone > .mio-menu-btn:hover,.mio-clone[open] > .mio-menu-btn{background:var(--cds-accent-fill-hover)}
.mio-clone .mio-menu-pop{left:auto;right:0;transform-origin:top right;width:min(360px,calc(100vw - 32px));max-width:none}
.mio-clone-field{display:flex;align-items:center;gap:4px;margin:4px 4px 8px;padding-left:10px;border-radius:var(--cds-radius);background:var(--cds-surface-3);box-shadow:inset 0 0 0 1px var(--cds-border)}
.mio-clone-field input{flex:1;height:var(--cds-h-control);padding:0;background:transparent;box-shadow:none!important;font-family:var(--font-anthropic-mono);font-size:12.5px}
.mio-clone-field .mio-btn{margin-right:2px}
.mio-menu-pop{position:absolute;top:calc(100% + 6px);left:0;z-index:60;min-width:200px;max-width:min(320px,calc(100vw - 16px));max-height:min(70vh,28rem);overflow-y:auto;
  padding:4px;border-radius:var(--cds-radius-card);background:var(--cds-surface-popover);box-shadow:var(--cds-shadow-popover);color:var(--cds-text-primary);
  transform-origin:top left;animation:mio-menu-in var(--cds-dur-base) var(--cds-ease-enter) both}
.mio-acct .mio-menu-pop{left:auto;right:0;transform-origin:top right}
@keyframes mio-menu-in{from{opacity:0;transform:scale(.96) translateY(-4px)}to{opacity:1;transform:none}}
.mio-menu-pop > a,.mio-menu-pop button[role=menuitem]{display:flex;align-items:center;gap:10px;width:100%;height:32px;padding:0 8px;border:0;border-radius:var(--cds-radius);background:transparent;
  font:inherit;font-size:13.5px;line-height:1;color:var(--cds-text-primary);text-align:left;cursor:pointer;white-space:nowrap;text-decoration:none;transition:background-color var(--cds-dur-fast) linear}
.mio-menu-pop > a > span:last-child{min-width:0;overflow:hidden;text-overflow:ellipsis}
.mio-menu-pop :is(a,button[role=menuitem]) svg{width:16px;height:16px;color:var(--cds-text-secondary)}
.mio-menu-pop :is(a,button[role=menuitem]):hover{background:var(--cds-fill-ghost-hover)}
.mio-menu-pop :is(a,button[role=menuitem]):focus-visible{outline:none;background:var(--cds-fill-ghost-hover);box-shadow:var(--cds-focus-shadow)}
.mio-menu-pop :is(a,button[role=menuitem]):active{background:var(--cds-fill-ghost-selected)}
.mio-menu-pop form{margin:0}
.mio-menu-h{padding:6px 8px 4px;font-size:12px;line-height:16px;color:var(--cds-text-hint);white-space:nowrap}
.mio-menu-h b{color:var(--cds-text-primary);font-weight:600}
.mio-menu-sep{height:1px;margin:4px -4px;background:var(--cds-border)}
.mio-ref .mio-menu-pop > a{font-family:var(--font-anthropic-mono);font-size:12.5px}
.mio-ref .mio-menu-pop > a[aria-checked=false] svg{visibility:hidden}
.mio-ref .mio-menu-pop > a[aria-checked=true] svg{color:var(--cds-accent-text)}
@media (pointer:coarse){.mio-menu-pop :is(a,button[role=menuitem]){min-height:44px}}
@media (max-width:420px){.mio-acct-btn{padding:0 6px}.mio-acct-l{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}}

/* ========== 手机端 ========== */
@media (max-width:960px){
  .repo-grid{grid-template-columns:minmax(0,1fr);grid-template-areas:"main" "side";gap:16px}
  .repo-side{padding:16px 0 0;box-shadow:inset 0 var(--cds-ring-hairline) 0 0 var(--cds-border)}
  .side-sec{padding:0;margin:0 0 12px;box-shadow:none}
  .side-sec:last-child{margin:0}
  .side-links{flex-direction:row;flex-wrap:wrap;gap:4px 16px}
}
@media (max-width:640px){
  .mio-wrap,#cgit{padding-left:16px;padding-right:16px}
  #cgit{padding-top:16px}
  .mio-tabs{margin:0 -16px 16px;padding:0 12px 1px}
  .md{padding:4px 18px 22px}
  table.list th,table.list td,.cl-row,.gh-card-h{padding-left:12px;padding-right:12px}
  .gh-commit{flex-wrap:wrap;row-gap:2px}
  .gh-commit .msg{flex-basis:100%;order:3}
  .gh-bar{gap:8px}
  .gh-counts{gap:4px 14px;order:3;flex-basis:100%}
  .gh-bar > .path{flex-basis:100%;order:4}
  .cl-row{align-items:flex-start}
  .cl-act .mio-btn-icon{display:none}
  .cl-row .cl-act .mio-btn-xs:not(.mono):not(.mio-btn-icon){padding:0 6px}
  .cm-meta{flex-direction:column;align-items:flex-start}
  .mio-toolbar select{flex:1 1 40%}
  .mio-toolbar .mio-input-group{flex:1 1 100%;order:-1}
  ul.repo-list li{grid-template-columns:minmax(0,1fr);grid-template-areas:"name" "desc" "meta";padding:12px 16px}
  .rl-meta{gap:14px;margin-top:6px}
  .df-summary-act{margin-left:0}
}
@media (prefers-reduced-motion:reduce){.mio-backdrop,.mio-dialog,.content,.mio-menu-pop{animation:none}}
`;

export const CSS = CDS_CSS + "\n" + APP_CSS;

/** boot (theme/lang before paint) + toggles + client-side zh/en */
export const APP_JS = String.raw`(function(){

var ef=document.getElementById('ed-form');
if(ef){var ta=ef.querySelector('textarea'),dirty=false,sent=false;
ta.addEventListener('input',function(){dirty=true});
ta.addEventListener('keydown',function(e){if(e.isComposing||e.keyCode===229)return;
if(e.key==='Tab'&&!e.metaKey&&!e.ctrlKey&&!e.altKey&&!e.shiftKey){e.preventDefault();ta.setRangeText('\t',ta.selectionStart,ta.selectionEnd,'end');dirty=true}
if(e.key==='Enter'&&(e.metaKey||e.ctrlKey)){e.preventDefault();ef.requestSubmit()}});
ef.addEventListener('submit',function(){sent=true;var b=ef.querySelector('button[type=submit]');if(b)b.disabled=true});
window.addEventListener('beforeunload',function(e){if(dirty&&!sent){e.preventDefault();e.returnValue=''}});}
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
    if(b.querySelector('svg')&&!b.textContent.trim()){b.classList.add('is-copied');var tt=b.title;b.title=lang()==='zh'?'已复制':'Copied';setTimeout(function(){b.classList.remove('is-copied');b.title=tt},2500);return}
    var o=b.innerHTML;b.textContent=lang()==='zh'?'已复制':'Copied';b.classList.add('is-copied');setTimeout(function(){b.innerHTML=o;b.classList.remove('is-copied')},2500)})});
  var dl=document.querySelector('[data-dialog-layer] .mio-dialog');
  if(dl){var go=function(){location.href=dl.getAttribute('data-cancel')||'/'};
    dl.parentNode.querySelector('.mio-backdrop').addEventListener('click',function(e){e.preventDefault();go()});
    document.addEventListener('keydown',function(e){
      if(e.key==='Escape'&&!e.isComposing){e.preventDefault();go();return}
      if(e.key==='Tab'){var f=[].slice.call(dl.querySelectorAll('input:not([type=hidden]):not([hidden]),select,textarea,button,a[href]'));if(!f.length)return;
        var a=f[0],z=f[f.length-1];if(e.shiftKey&&document.activeElement===a){e.preventDefault();z.focus()}else if(!e.shiftKey&&document.activeElement===z){e.preventDefault();a.focus()}
        else if(!dl.contains(document.activeElement)){e.preventDefault();a.focus()}}});
    var fi=dl.querySelector('[autofocus]')||dl.querySelector('input[type=password]')||dl.querySelector('input:not([type=hidden]):not([readonly])');if(fi)fi.focus();}
  var M=[].slice.call(document.querySelectorAll('details[data-menu]'));
  if(M.length){M.forEach(function(m){m.addEventListener('toggle',function(){if(m.open)M.forEach(function(x){if(x!==m)x.open=false})})});
    document.addEventListener('click',function(e){M.forEach(function(m){if(m.open&&!m.contains(e.target))m.open=false})});
    document.addEventListener('keydown',function(e){if(e.key!=='Escape'||e.isComposing)return;M.forEach(function(m){if(m.open){m.open=false;m.querySelector('summary').focus()}})});}
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
export const UI_VER = (() => { let h = 5381; const s = CSS + APP_JS + "layout-v12"; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); })();
