// Registers a "kex" language with Monaco (Monarch tokenizer + a theme that
// matches the static highlighter in ~/lib/highlight.ts and the `.tok-*`
// colors in global.css), so the playground editor looks like every other
// code block on the site.
import type * as Monaco from "monaco-editor";

const KEYWORDS = [
  "let", "var", "make", "record", "type", "do", "end", "match", "return",
  "if", "elif", "else", "then", "unless", "trait", "foul", "implement",
  "main", "static", "using", "module", "in", "loop", "receive", "spawn",
  "where", "while", "for", "break", "next", "begin", "fn", "and", "or",
  "not", "as", "is", "with", "from", "into",
];

const CONSTANTS = [
  "true", "false", "nil",
  "Just", "None", "Some",
  "Ok", "Error",
  "Less", "Greater", "Equal",
  "This",
];

export const KEX_LANGUAGE_ID = "kex";

export function registerKexLanguage(monaco: typeof Monaco) {
  if (monaco.languages.getEncodedLanguageId(KEX_LANGUAGE_ID) !== 0) return;

  monaco.languages.register({ id: KEX_LANGUAGE_ID, extensions: [".kex"] });

  monaco.languages.setLanguageConfiguration(KEX_LANGUAGE_ID, {
    comments: { lineComment: "#" },
    brackets: [
      ["do", "end"],
      ["(", ")"],
      ["[", "]"],
      ["{", "}"],
    ],
    autoClosingPairs: [
      { open: "(", close: ")" },
      { open: "[", close: "]" },
      { open: "{", close: "}" },
      { open: '"', close: '"', notIn: ["string"] },
    ],
    surroundingPairs: [
      { open: "(", close: ")" },
      { open: "[", close: "]" },
      { open: "{", close: "}" },
      { open: '"', close: '"' },
    ],
  });

  monaco.languages.setMonarchTokensProvider(KEX_LANGUAGE_ID, {
    defaultToken: "",
    keywords: KEYWORDS,
    constants: CONSTANTS,

    operators: ["->", "=>", "<-", "==", "!=", "<=", ">=", "&&", "||", ":", "??"],

    symbols: /[=><!~?:&|+\-*\/^%.]+/,

    tokenizer: {
      root: [
        // identifiers / keywords / constants / types
        [
          /[A-Za-z_][A-Za-z0-9_?!]*/,
          {
            cases: {
              "@keywords": "keyword",
              "@constants": "constant",
              "[A-Z].*": "type",
              "@default": "identifier",
            },
          },
        ],

        [/@[A-Za-z_][A-Za-z0-9_?!]*/, "variable.predefined"],

        { include: "@whitespace" },

        [/0[xX][0-9a-fA-F_]+/, "number.hex"],
        [/\d[\d_]*(\.\d[\d_]*)?([eE][+-]?\d+)?/, "number"],

        [/[{}()\[\]]/, "@brackets"],
        [/[,;]/, "delimiter"],
        [
          /@symbols/,
          {
            cases: {
              "@operators": "operator",
              "@default": "operator",
            },
          },
        ],

        [/"/, { token: "string.quote", next: "@string" }],
      ],

      whitespace: [
        [/[ \t\r\n]+/, ""],
        [/#.*$/, "comment"],
      ],

      string: [
        [/\$\{/, { token: "delimiter.bracket", next: "@interpolation" }],
        [/[^\\"$]+/, "string"],
        [/\\./, "string.escape"],
        [/"/, { token: "string.quote", next: "@pop" }],
      ],

      interpolation: [
        [/\}/, { token: "delimiter.bracket", next: "@pop" }],
        { include: "root" },
      ],
    },
  });
}

/** Dark theme matching the site's `.tok-*` code-block colors (global.css). */
export function defineKexTheme(monaco: typeof Monaco) {
  monaco.editor.defineTheme("kex-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "comment", foreground: "94876a", fontStyle: "italic" },
      { token: "keyword", foreground: "f0c987" },
      { token: "type", foreground: "e6a960" },
      { token: "string", foreground: "c9e0a0" },
      { token: "string.quote", foreground: "c9e0a0" },
      { token: "string.escape", foreground: "e9e0cf" },
      { token: "number", foreground: "ffc18a" },
      { token: "number.hex", foreground: "ffc18a" },
      { token: "operator", foreground: "d8b878" },
      { token: "delimiter", foreground: "a89a78" },
      { token: "delimiter.bracket", foreground: "e9e0cf" },
      { token: "constant", foreground: "e6a960" },
      { token: "variable.predefined", foreground: "f0e8d4" },
      { token: "identifier", foreground: "d6d6e6" },
    ],
    colors: {
      "editor.background": "#1b140a",
      "editor.foreground": "#d6d6e6",
      "editorLineNumber.foreground": "#6b6b80",
      "editorLineNumber.activeForeground": "#9a9ab0",
      "editor.selectionBackground": "#3a2c14",
      "editor.inactiveSelectionBackground": "#2a2010",
      "editorCursor.foreground": "#f0c987",
      "editor.lineHighlightBackground": "#221a0e",
      "editorGutter.background": "#1b140a",
      "editorWidget.background": "#221a0e",
      "editorWidget.border": "#382a16",
    },
  });
}
