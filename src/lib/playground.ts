// The playground editor + run loop. Monaco on the left, plain-text stdout on
// the right; the same wasm interpreter the REPL uses runs the whole buffer on
// demand (Cmd/Ctrl+Enter or the Run button).
//
// Two pieces are loaded lazily and only on this page:
//
//   - monaco-editor (with its editor worker wired through Vite's `?worker`
//     import) — the worker import MUST run before any monaco code touches
//     `self.MonacoEnvironment`, so we set it up at the top of `loadMonaco()`
//     rather than at module top-level, keeping Monaco off the critical path
//     for every other page on the site.
//
//   - /kex-repl/index.mjs, the wasm bundle, via the same `new Function`
//     native-import trick as src/lib/repl.ts. See that file for why this
//     can't be a normal static import (Vite would rewrite it into a
//     `?import`-suffixed request that the static asset under public/ can't
//     answer).
import type * as Monaco from "monaco-editor";
import {
  registerKexLanguage,
  defineKexTheme,
  KEX_LANGUAGE_ID,
} from "~/lib/kex-monaco";

const nativeImport: (specifier: string) => Promise<any> = new Function(
  "specifier",
  "return import(specifier)",
) as (specifier: string) => Promise<any>;

export interface PlaygroundHandle {
  destroy(): void;
  /** Runs the current buffer through the interpreter, replaces the output pane. */
  run(): Promise<void>;
  /**
   * Replaces the editor's contents. Pass `{ silent: true }` for programmatic
   * loads (e.g. picking an example) — suppresses the next `onEdit` callback so
   * the caller can decide separately whether to update the share hash and/or
   * overwrite the saved draft. Default (`silent: false`) fires `onEdit`
   * exactly like a user keystroke.
   */
  setValue(code: string, opts?: { silent?: boolean }): void;
  getValue(): string;
  /** Clears the output pane only. */
  clearOutput(): void;
}

export interface PlaygroundOptions {
  editorContainer: HTMLElement;
  outputEl: HTMLElement;
  statusEl: HTMLElement;
  initialCode: string;
  /** Fired (debounced) when the editor's content changes due to user input
     (not programmatic setValue). The page closes over its own active-tab
     state to decide what to do with the new code — typically: update the
     active saved program in the store, and always refresh the URL hash. */
  onEdit?: (code: string) => void;
}

export const STARTER_CODE = `main do
  let who = "world"
  IO.printLine("Hello, \${who}!")
  IO.printLine((1..10).reduce(0, ~(+)))
end
`;

// Matches ANSI CSI sequences (color, cursor moves, etc.) so we can render
// the interpreter's output as plain text. The wasm REPL emits these to drive
// xterm.js; the playground strips them rather than spinning up a second
// terminal, which keeps the output pane light and selectable.
const ANSI_RE = /\x1b\[[0-9;]*[A-Za-z]/g;

function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, "");
}

// Monaco is a heavy import; load it once per page (a Playground is a singleton
// by design) and reuse the promise for any speculative re-mounts.
let monacoPromise: Promise<typeof Monaco> | null = null;
async function loadMonaco(): Promise<typeof Monaco> {
  if (!monacoPromise) {
    monacoPromise = (async () => {
      // Wire the editor worker before any monaco code reads MonacoEnvironment.
      // We deliberately don't load language-specific workers (json/css/ts) —
      // kex is just a Monarch tokenizer, the core worker is all we need.
      const { default: EditorWorker } = await import(
        "monaco-editor/esm/vs/editor/editor.worker?worker"
      );
      (self as unknown as { MonacoEnvironment: unknown }).MonacoEnvironment = {
        getWorker() {
          return new EditorWorker();
        },
      };
      const monaco = await import("monaco-editor");
      registerKexLanguage(monaco);
      defineKexTheme(monaco);
      return monaco;
    })();
  }
  return monacoPromise;
}

export async function mountPlayground(
  opts: PlaygroundOptions,
): Promise<PlaygroundHandle> {
  const [monaco, { Kex }] = await Promise.all([
    loadMonaco(),
    nativeImport("/kex-repl/index.mjs").then((m: any) => m),
  ]);

  const session = await Kex.create();

  const editor = monaco.editor.create(opts.editorContainer, {
    value: opts.initialCode,
    language: KEX_LANGUAGE_ID,
    theme: "kex-dark",
    fontFamily:
      'ui-monospace, SFMono-Regular, Menlo, Consolas, "JetBrains Mono", monospace',
    fontSize: 14,
    fontLigatures: false,
    lineHeight: 1.7,
    tabSize: 2,
    automaticLayout: true,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    smoothScrolling: true,
    cursorBlinking: "smooth",
    padding: { top: 16, bottom: 16 },
    renderWhitespace: "selection",
    fixedOverflowWidgets: true,
  });

  // Debounce external side-effects of editing (URL hash update + localStorage
  // persistence). The editor itself stays instant; only the slower work is
  // throttled. `suppressNextEdit` lets `setValue({ silent: true })` swap the
  // buffer without triggering persistence — used by the examples dropdown so
  // previewing an example doesn't overwrite the user's saved draft.
  let editTimer: ReturnType<typeof setTimeout> | null = null;
  let suppressNextEdit = false;
  editor.onDidChangeModelContent(() => {
    if (suppressNextEdit) {
      suppressNextEdit = false;
      return;
    }
    if (!opts.onEdit) return;
    if (editTimer) clearTimeout(editTimer);
    editTimer = setTimeout(() => {
      opts.onEdit?.(editor.getValue());
      editTimer = null;
    }, 400);
  });

  opts.statusEl.textContent = "ready";

  const renderOutput = (text: string, isError = false) => {
    const stripped = stripAnsi(text).replace(/\n$/, "");
    // textContent (not innerHTML) — program output must never be parsed as
    // HTML, and the pane re-flows fine with whitespace: pre-wrap.
    opts.outputEl.textContent = stripped.length > 0 ? stripped : "(no output)";
    opts.outputEl.dataset.state = isError ? "error" : "ok";
  };

  const run = async () => {
    const src = editor.getValue();
    if (src.trim().length === 0) {
      renderOutput("(empty program)");
      return;
    }
    opts.statusEl.textContent = "running…";
    try {
      const out = await session.eval(src);
      // The interpreter routes compile-time / parse errors through the same
      // result channel, so we can't reliably tell success from failure by
      // return value alone. Treat anything that looks like a kex error
      // report (a line beginning with "error:" or "Error") as the error
      // state purely for pane coloring.
      const looksLikeError =
        /(^|\n)\s*(error|Error|ParseError|TypeError)\b/.test(stripAnsi(out));
      renderOutput(out, looksLikeError);
      opts.statusEl.textContent = "ready";
    } catch (err) {
      renderOutput(String(err instanceof Error ? err.message : err), true);
      opts.statusEl.textContent = "error";
    }
  };

  const setValue = (code: string, setValueOpts: { silent?: boolean } = {}) => {
    // `executeEdits` is Monaco's standard "replace the whole buffer" gesture.
    // It fires `onDidChangeModelContent` like a real keystroke; we suppress
    // the resulting `onEdit` callback when the caller asked for a silent load
    // so the URL hash / localStorage are left untouched for the caller to
    // decide about.
    if (setValueOpts.silent) suppressNextEdit = true;
    editor.executeEdits("playground", [
      {
        range: editor.getModel()!.getFullModelRange(),
        text: code,
        forceMoveMarkers: true,
      },
    ]);
    editor.focus();
  };

  const getValue = () => editor.getValue();

  const clearOutput = () => {
    opts.outputEl.textContent = "";
    opts.outputEl.dataset.state = "idle";
  };

  const destroy = () => {
    if (editTimer) clearTimeout(editTimer);
    session.destroy();
    editor.dispose();
  };

  window.addEventListener("pagehide", destroy, { once: true });

  return { destroy, run, setValue, getValue, clearOutput };
}
