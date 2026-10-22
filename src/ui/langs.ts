/** Extension -> [language, GitHub linguist color]. Programming/markup languages only; prose and data are not counted, as on GitHub. */
const L: Record<string, [string, string]> = {};
const add = (name: string, color: string, exts: string[]) => exts.forEach((e) => (L[e] = [name, color]));
add("TypeScript", "#3178c6", ["ts", "tsx", "mts", "cts"]);
add("JavaScript", "#f1e05a", ["js", "jsx", "mjs", "cjs"]);
add("Python", "#3572A5", ["py", "pyi"]);
add("Go", "#00ADD8", ["go"]);
add("Rust", "#dea584", ["rs"]);
add("Java", "#b07219", ["java"]);
add("Kotlin", "#A97BFF", ["kt", "kts"]);
add("Swift", "#F05138", ["swift"]);
add("C", "#555555", ["c", "h"]);
add("C++", "#f34b7d", ["cc", "cpp", "cxx", "hpp", "hh", "hxx"]);
add("C#", "#178600", ["cs"]);
add("Objective-C", "#438eff", ["m", "mm"]);
add("Ruby", "#701516", ["rb"]);
add("PHP", "#4F5D95", ["php"]);
add("Dart", "#00B4AB", ["dart"]);
add("Scala", "#c22d40", ["scala"]);
add("Lua", "#000080", ["lua"]);
add("Zig", "#ec915c", ["zig"]);
add("Elixir", "#6e4a7e", ["ex", "exs"]);
add("Haskell", "#5e5086", ["hs"]);
add("Shell", "#89e051", ["sh", "bash", "zsh"]);
add("PowerShell", "#012456", ["ps1"]);
add("HTML", "#e34c26", ["html", "htm"]);
add("CSS", "#663399", ["css"]);
add("SCSS", "#c6538c", ["scss"]);
add("Less", "#1d365d", ["less"]);
add("Vue", "#41b883", ["vue"]);
add("Svelte", "#ff3e00", ["svelte"]);
add("Astro", "#ff5a03", ["astro"]);
add("SQL", "#e38c00", ["sql"]);
add("Dockerfile", "#384d54", ["dockerfile"]);
add("Makefile", "#427819", ["makefile", "mk"]);
add("Nix", "#7e7eff", ["nix"]);
add("Vim Script", "#199f4b", ["vim"]);
add("R", "#198CE7", ["r"]);
add("Julia", "#a270ba", ["jl"]);
add("OCaml", "#ef7a08", ["ml", "mli"]);
add("Clojure", "#db5855", ["clj", "cljs"]);
add("Perl", "#0298c3", ["pl", "pm"]);
add("Solidity", "#AA6746", ["sol"]);
add("WebAssembly", "#04133b", ["wat"]);

const VENDOR = /(^|\/)(node_modules|vendor|third_party|dist|build|out|\.git|bower_components|Pods)\/|\.min\.(js|css)$|(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml)$/i;

export function langOf(path: string): [string, string] | null {
  if (VENDOR.test(path)) return null;
  const base = path.slice(path.lastIndexOf("/") + 1);
  const lower = base.toLowerCase();
  if (lower === "dockerfile" || lower.startsWith("dockerfile.")) return L["dockerfile"];
  if (lower === "makefile" || lower === "gnumakefile") return L["makefile"];
  const dot = lower.lastIndexOf(".");
  if (dot <= 0) return null;
  return L[lower.slice(dot + 1)] ?? null;
}

export interface LangStat { name: string; color: string; bytes: number; pct: number }

export function summarize(bytesBy: Map<string, { color: string; bytes: number }>): LangStat[] {
  const total = [...bytesBy.values()].reduce((a, b) => a + b.bytes, 0);
  if (!total) return [];
  const all = [...bytesBy.entries()].map(([name, v]) => ({ name, color: v.color, bytes: v.bytes, pct: (v.bytes / total) * 100 }))
    .sort((a, b) => b.bytes - a.bytes);
  // like GitHub: show the top languages, fold the tail (<1% beyond the 6th) into Other
  const head = all.filter((x, i) => i < 6 || x.pct >= 1).slice(0, 8);
  const rest = all.slice(head.length);
  if (rest.length) {
    const b = rest.reduce((a, x) => a + x.bytes, 0);
    head.push({ name: "Other", color: "#8b949e", bytes: b, pct: (b / total) * 100 });
  }
  return head;
}

export function langColor(name: string): string {
  for (const v of Object.values(L)) if (v[0] === name) return v[1];
  return "#8b949e";
}
