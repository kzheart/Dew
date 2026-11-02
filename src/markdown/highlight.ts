import hljs from "highlight.js/lib/common";
import type { DiffLine, ParsedDiff } from "./diff";

/** highlight.js scopes in the prototype's token colors. */
const SCOPES: Record<string, string> = {
  keyword: "tk-kw",
  literal: "tk-kw",
  "selector-tag": "tk-kw",
  tag: "tk-kw",
  name: "tk-kw",
  doctag: "tk-kw",
  built_in: "tk-ty",
  type: "tk-ty",
  "title.class": "tk-ty",
  "title.class.inherited": "tk-ty",
  title: "tk-fn",
  "title.function": "tk-fn",
  "title.function.invoke": "tk-fn",
  "selector-class": "tk-fn",
  "selector-id": "tk-fn",
  section: "tk-fn",
  string: "tk-str",
  regexp: "tk-str",
  char: "tk-str",
  number: "tk-num",
  symbol: "tk-num",
  attr: "tk-attr",
  attribute: "tk-attr",
  "variable.language": "tk-kw",
  comment: "tk-com",
  meta: "tk-meta",
  "meta keyword": "tk-kw",
  bullet: "tk-mark",
  link: "tk-link",
  quote: "tk-q",
  strong: "tk-b",
  emphasis: "tk-i",
  addition: "tk-ty",
  deletion: "tk-str",
};

const LANGS: Record<string, string> = {
  ts: "TypeScript", typescript: "TypeScript", tsx: "TSX", js: "JavaScript", javascript: "JavaScript",
  jsx: "JSX", mjs: "JavaScript", go: "Go", golang: "Go", py: "Python", python: "Python", rs: "Rust",
  rust: "Rust", sh: "Shell", bash: "Shell", zsh: "Shell", shell: "Shell", console: "Shell",
  json: "JSON", yaml: "YAML", yml: "YAML", toml: "TOML", html: "HTML", xml: "XML", svg: "SVG",
  css: "CSS", scss: "SCSS", less: "Less", md: "Markdown", markdown: "Markdown", sql: "SQL",
  java: "Java", kotlin: "Kotlin", kt: "Kotlin", swift: "Swift", c: "C", h: "C", cpp: "C++",
  "c++": "C++", cs: "C#", csharp: "C#", rb: "Ruby", ruby: "Ruby", php: "PHP", diff: "Diff",
  lua: "Lua", r: "R", dart: "Dart", objc: "Objective-C", graphql: "GraphQL", ini: "INI",
  dockerfile: "Dockerfile", makefile: "Makefile", text: "纯文本", txt: "纯文本", plaintext: "纯文本",
};

export function languageLabel(lang: string): string {
  if (!lang) return "纯文本";
  return LANGS[lang.toLowerCase()] ?? lang;
}

export const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * One HTML string per diff line. The code lines are highlighted together in
 * the language of the file the diff names; hunk and meta lines stay plain.
 */
export function highlightDiff(diff: ParsedDiff, title: string): string[] {
  const isCode = (l: DiffLine) => l.type !== "hunk" && l.type !== "meta";
  const lang = /\.([\w+-]+)$/.exec(title)?.[1] ?? "";
  const code = highlightLines(diff.lines.filter(isCode).map((l) => l.text).join("\n"), lang);
  let i = 0;
  return diff.lines.map((l) => (isCode(l) ? code[i++]! : escapeHtml(l.text)));
}

/** One HTML string per line of code, with tk-* spans that never cross a line. */
export function highlightLines(code: string, lang: string): string[] {
  const language = lang && hljs.getLanguage(lang) ? lang : null;
  if (!language) return code.split("\n").map(escapeHtml);
  const html = hljs.highlight(code, { language, ignoreIllegals: true }).value;
  return splitHtmlLines(html, SCRIPT_LANGS.has(hljs.getLanguage(language)!.name ?? "") ? new Set(["tk-attr"]) : new Set());
}

// highlight.js marks parameter names before a type annotation as attributes,
// which the prototype leaves plain.
const SCRIPT_LANGS = new Set(["TypeScript", "JavaScript"]);

const TOKEN = /<span class="([^"]*)">|<\/span>|([^<]+)/g;

function scopeClass(cls: string): string {
  const parts = cls.split(/\s+/).map((c) => c.replace(/^hljs-/, "").replace(/_+$/, ""));
  for (let n = parts.length; n > 0; n--) {
    const key = parts.slice(0, n).join(".");
    if (SCOPES[key]) return SCOPES[key];
  }
  return SCOPES[parts.join(" ")] ?? "";
}

function splitHtmlLines(html: string, plain: Set<string>): string[] {
  const lines: string[] = [];
  const open: string[] = [];
  let line = "";
  const reopen = () => open.map((c) => `<span class="${c}">`).join("");
  for (const m of html.matchAll(TOKEN)) {
    if (m[1] !== undefined) {
      const scope = scopeClass(m[1]);
      const c = scope && !plain.has(scope) ? scope : "tk-tx";
      open.push(c);
      line += `<span class="${c}">`;
    } else if (m[0] === "</span>") {
      open.pop();
      line += "</span>";
    } else {
      const parts = m[2]!.split("\n");
      parts.forEach((part, i) => {
        if (i > 0) {
          lines.push(line + "</span>".repeat(open.length));
          line = reopen();
        }
        line += part;
      });
    }
  }
  lines.push(line + "</span>".repeat(open.length));
  return lines;
}
