/**
 * A small, dependency-free syntax highlighter for the Kex language.
 *
 * Runs at build time only — the emitted HTML is static, so there is no
 * client-side JavaScript cost for code samples. It is intentionally a
 * "good enough" tokenizer rather than a full grammar: it covers the surface
 * syntax shown across the examples and docs in this repo.
 *
 * Public entry point: `highlightKex(source) -> string` returns HTML with
 * `<span class="tok-*">` tokens. Plain text is HTML-escaped.
 */

const KEYWORDS = new Set([
  "let", "var", "make", "record", "type", "do", "end", "match", "return",
  "if", "elif", "else", "then", "unless", "trait", "foul", "implement",
  "main", "static", "using", "module", "in", "loop", "receive", "spawn",
  "where", "while", "for", "break", "next", "begin", "fn", "and", "or",
  "not", "as", "is", "with", "from", "into",
]);

/** Built-in constructors / sentinels colored like constants. */
const CONSTANTS = new Set([
  "true", "false", "nil",
  "Just", "None", "Some",
  "Ok", "Error",
  "Less", "Greater", "Equal",
  "This",
]);

/** Well-known type / module names colored as types even when not capitalized. */
const TYPE_NAMES = new Set([
  "Int", "Float", "Bool", "String", "Char", "Symbol",
  "Integer", "List", "Map", "Vector", "Set",
  "Result", "Optional", "Range", "Stream", "Feed", "Process",
  "IO", "Math", "File", "Http", "SecurityEvent", "Config", "AppError",
  "A", "B", "T", "K", "V",
]);

type Tok = { c: string; t: string };

const esc = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

class Lexer {
  private src: string;
  private i = 0;
  private out: Tok[] = [];

  constructor(src: string) {
    this.src = src;
  }

  private push(t: string, c: string) {
    this.out.push({ c, t });
  }

  /** Look at the next non-space character(s) without consuming. */
  private peekRaw(offset = 0): string {
    return this.src[this.i + offset] ?? "";
  }

  /** Previous emitted non-whitespace token text. */
  private lastNonSpace(): string | null {
    for (let k = this.out.length - 1; k >= 0; k--) {
      const v = this.out[k];
      if (v.t !== "plain" || v.c.trim() !== "") return v.c;
    }
    return null;
  }

  lex(): Tok[] {
    const s = this.src;
    const n = s.length;

    while (this.i < n) {
      const ch = s[this.i];

      // whitespace and newlines pass through
      if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
        let j = this.i + 1;
        while (j < n && /[ \t\n\r]/.test(s[j])) j++;
        this.push("plain", s.slice(this.i, j));
        this.i = j;
        continue;
      }

      // line comment
      if (ch === "#") {
        let j = this.i + 1;
        while (j < n && s[j] !== "\n") j++;
        this.push("comment", s.slice(this.i, j));
        this.i = j;
        continue;
      }

      // string with ${...} interpolation
      if (ch === '"') {
        this.readString();
        continue;
      }

      // numbers (incl. 0x, floats, exponents)
      if (/[0-9]/.test(ch)) {
        let j = this.i + 1;
        if (s[this.i] === "0" && (s[j] === "x" || s[j] === "X")) {
          j += 2;
          while (j < n && /[0-9a-fA-F_]/.test(s[j])) j++;
        } else {
          while (j < n && /[0-9_]/.test(s[j])) j++;
          if (s[j] === "." && /[0-9]/.test(s[j + 1] ?? "")) {
            j += 1;
            while (j < n && /[0-9_]/.test(s[j])) j++;
          }
          if (s[j] === "e" || s[j] === "E") {
            j += 1;
            if (s[j] === "+" || s[j] === "-") j += 1;
            while (j < n && /[0-9]/.test(s[j])) j++;
          }
        }
        this.push("number", s.slice(this.i, j));
        this.i = j;
        continue;
      }

      // @field / @method shorthand
      if (ch === "@") {
        let j = this.i + 1;
        while (j < n && /[A-Za-z0-9_?!]/.test(s[j])) j++;
        const inner = s.slice(this.i + 1, j);
        if (inner) {
          this.push("op", "@");
          this.push("field", inner);
        } else {
          this.push("op", "@");
        }
        this.i = j;
        continue;
      }

      // identifiers / keywords
      if (/[A-Za-z_]/.test(ch)) {
        let j = this.i + 1;
        while (j < n && /[A-Za-z0-9_?!]/.test(s[j])) j++;
        const word = s.slice(this.i, j);

        // skip following spaces to peek at the next significant char
        let k = j;
        while (k < n && /[ \t]/.test(s[k])) k++;
        const nextCh = s[k] ?? "";
        const prev = this.lastNonSpace();
        const prevIsDot = prev === ".";

        if (KEYWORDS.has(word)) {
          this.push("keyword", word);
        } else if (CONSTANTS.has(word) && !prevIsDot) {
          this.push("bool", word);
        } else if (/^[A-Z]/.test(word)) {
          this.push("type", word);
        } else if (prevIsDot) {
          this.push("method", word);
        } else if (nextCh === "(") {
          this.push("fn", word);
        } else if (TYPE_NAMES.has(word)) {
          this.push("type", word);
        } else {
          this.push("ident", word);
        }
        this.i = j;
        continue;
      }

      // operators / punctuation
      const three = s.slice(this.i, this.i + 3);
      const two = s.slice(this.i, this.i + 2);
      if (two === "...") {
        this.push("op", two);
        this.i += 2;
        continue;
      }
      if (
        ["->", "=>", "<-", "==", "!=", "<=", ">=", "&&", "||", "::", "??"].includes(two)
      ) {
        this.push("op", two);
        this.i += 2;
        continue;
      }
      if ("+-*/%<>!=&|~?:.".includes(ch)) {
        this.push("op", ch);
        this.i += 1;
        continue;
      }
      if ("(){}[],;".includes(ch)) {
        this.push("punct", ch);
        this.i += 1;
        continue;
      }

      // anything else (rare) — emit escaped single char
      this.push("plain", esc(ch));
      this.i += 1;
    }

    return this.out;
  }

  /** Read a `"..."` literal, recursing into `${ ... }` interpolations. */
  private readString() {
    const s = this.src;
    const n = s.length;
    this.push("string", '"');
    let j = this.i + 1;

    while (j < n) {
      const c = s[j];

      // end of string
      if (c === '"') {
        if (j > this.i + 1) this.push("string", s.slice(this.i + 1, j));
        this.push("string", '"');
        this.i = j + 1;
        return;
      }

      // escape
      if (c === "\\") {
        j += 2;
        continue;
      }

      // interpolation ${ ... }
      if (c === "$" && s[j + 1] === "{") {
        if (j > this.i + 1) this.push("string", s.slice(this.i + 1, j));
        this.push("string", "${");
        // find matching closing brace, honoring nested strings/braces
        let depth = 1;
        let m = j + 2;
        while (m < n && depth > 0) {
          const cm = s[m];
          if (cm === '"') {
            // skip an embedded string quickly
            let q = m + 1;
            while (q < n) {
              if (s[q] === "\\") {
                q += 2;
                continue;
              }
              if (s[q] === '"') break;
              q += 1;
            }
            m = q + 1;
            continue;
          }
          if (cm === "{") depth += 1;
          else if (cm === "}") depth -= 1;
          if (depth === 0) break;
          m += 1;
        }
        const inner = s.slice(j + 2, m);
        // recursively tokenize the interpolated expression
        const innerToks = new Lexer(inner).lex();
        for (const t of innerToks) this.out.push(t);
        this.push("string", "}");
        // resume string parsing after the close brace
        this.i = m + 1;
        // restart reading the remainder as a fresh string segment
        this.readStringCont();
        return;
      }

      j += 1;
    }

    // unterminated — flush the rest
    this.push("string", s.slice(this.i + 1));
    this.i = n;
  }

  /** Continue reading a string body after an interpolation close-brace. */
  private readStringCont() {
    const s = this.src;
    const n = s.length;
    let j = this.i;
    while (j < n) {
      const c = s[j];
    if (c === '"') {
      if (j > this.i) this.push("string", s.slice(this.i, j));
        this.push("string", '"');
        this.i = j + 1;
        return;
      }
      if (c === "\\") {
        j += 2;
        continue;
      }
      if (c === "$" && s[j + 1] === "{") {
        if (j > this.i) this.push("string", s.slice(this.i, j));
        this.push("string", "${");
        let depth = 1;
        let m = j + 2;
        while (m < n && depth > 0) {
          const cm = s[m];
          if (cm === '"') {
            let q = m + 1;
            while (q < n) {
              if (s[q] === "\\") {
                q += 2;
                continue;
              }
              if (s[q] === '"') break;
              q += 1;
            }
            m = q + 1;
            continue;
          }
          if (cm === "{") depth += 1;
          else if (cm === "}") depth -= 1;
          if (depth === 0) break;
          m += 1;
        }
        const inner = s.slice(j + 2, m);
        const innerToks = new Lexer(inner).lex();
        for (const t of innerToks) this.out.push(t);
        this.push("string", "}");
        this.i = m + 1;
        this.readStringCont();
        return;
      }
      j += 1;
    }
    this.push("string", s.slice(this.i));
    this.i = n;
  }
}

const CLASS_FOR: Record<string, string> = {
  comment: "tok-comment",
  keyword: "tok-keyword",
  type: "tok-type",
  bool: "tok-bool",
  number: "tok-number",
  string: "tok-string",
  fn: "tok-fn",
  method: "tok-method",
  field: "tok-field",
  op: "tok-op",
  punct: "tok-punct",
  ident: "tok-ident",
  plain: "tok-plain",
};

/** Highlight a Kex source string as static HTML. */
export function highlightKex(source: string): string {
  const tokens = new Lexer(source).lex();
  let html = "";
  for (const t of tokens) {
    const cls = CLASS_FOR[t.t] ?? "tok-plain";
    const text = t.t === "plain" ? t.c : esc(t.c);
    if (cls === "tok-plain" || cls === "tok-ident") {
      // render plain/ident without an extra span
      html += text;
    } else {
      html += `<span class="${cls}">${text}</span>`;
    }
  }
  return html;
}
