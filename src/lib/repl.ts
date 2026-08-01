// Live in-browser REPL, backed by the @kexhq/kex wasm interpreter. Adapted
// from the reference client in the kex repo (web/index.html) — same line
// editing / history / multi-line-block / tab-completion behavior, but going
// through the `Kex` class API (session.eval/complete) instead of raw
// Module.ccall, since that's the package's intended public surface.
//
// The wasm bundle is loaded from /kex-repl/index.mjs (a plain static asset
// synced by scripts/sync-kex-wasm.mjs — see that file for why this isn't a
// normal bundled import) via a runtime dynamic import, so it's only ever
// fetched by visitors who actually load this module.
import "@xterm/xterm/css/xterm.css";
import type { Terminal as TerminalType } from "@xterm/xterm";

// A truly native dynamic import, hidden from Vite's dev-time import-analysis
// transform. Vite instruments every `import(...)` expression it can see in
// AST form (even with a non-literal argument) by appending a `?import`
// cache-busting query — fine for project source, but fatal here since
// /kex-repl/index.mjs is a plain static file under public/, served as-is,
// with no such query variant. Constructing the import call inside a
// `new Function` body isn't parsed as an ImportExpression node by Vite's
// (esbuild-based) transform, so it reaches the browser's native module
// loader untouched.
const nativeImport: (specifier: string) => Promise<any> = new Function(
  "specifier",
  "return import(specifier)",
) as (specifier: string) => Promise<any>;

export type ReplStatus = "loading" | "ready" | "error";

export interface ReplHandle {
  destroy(): void;
  /**
   * Feeds a snippet into the terminal as if the user had typed and submitted
   * it line by line — used by "Paste to REPL" buttons on tutorial code
   * samples. Scrolls/focuses the terminal so the result is visible.
   */
  pasteText(text: string): Promise<void>;
  /** Live-adjusts the terminal font size (clamped, persisted in-browser). */
  setFontSize(size: number): void;
  /** Re-measures the terminal against its container size (call after resize). */
  fit(): void;
}

export interface ReplMountOptions {
  onStatus?: (status: ReplStatus) => void;
  /** Notified with the current font size on mount and whenever it changes. */
  onFontSize?: (size: number) => void;
}

const PROMPT = "kex> ";
const CONT_PROMPT = "...> ";
const HISTORY_KEY = "kex-repl-history";
const FONT_SIZE_KEY = "kex-repl-font-size";

// Default font size tuned for the current REPL density (banner + tutorial
// output + prompt history all share the viewport now). Exposed so the page
// can drive its own +/- controls and disable them at the bounds.
export const DEFAULT_REPL_FONT_SIZE = 14;
export const REPL_FONT_SIZE_MIN = 8;
export const REPL_FONT_SIZE_MAX = 32;

function loadFontSize(): number {
  try {
    const stored = Number(localStorage.getItem(FONT_SIZE_KEY));
    if (
      Number.isFinite(stored) &&
      stored >= REPL_FONT_SIZE_MIN &&
      stored <= REPL_FONT_SIZE_MAX
    ) {
      return Math.round(stored);
    }
  } catch {
    // localStorage unavailable (private browsing etc.) — fall back to default.
  }
  return DEFAULT_REPL_FONT_SIZE;
}

// Straight port of the native REPL's `countBlocks` (see main.cxx / the
// reference web/index.html) — counts unmatched `do`/`end` keywords at word
// boundaries to decide whether a multi-line block is still open.
function countBlocks(s: string): number {
  let count = 0;
  const isAlnum = (c: string | undefined) => c !== undefined && /[A-Za-z0-9]/.test(c);
  for (let i = 0; i < s.length; i++) {
    if (s.substring(i, i + 2) === "do") {
      if (!isAlnum(s[i - 1]) && !isAlnum(s[i + 2])) count++;
    }
    if (s.substring(i, i + 3) === "end") {
      if (!isAlnum(s[i - 1]) && !isAlnum(s[i + 3])) count--;
    }
  }
  return count;
}

// '.' and '"' are deliberately excluded so "IO.pri<TAB>" and
// "[1,2,3].ma<TAB>" are each treated as one word — matches the native
// REPL's rl_completer_word_break_characters.
const WORD_BREAK_CHARS = " \t\n\\@$><=;|&{(";

function findWordStart(s: string, end: number): number {
  let i = end;
  while (i > 0 && WORD_BREAK_CHARS.indexOf(s[i - 1]) === -1) i--;
  return i;
}

// Word-by-word cursor movement (Option/Alt+Left/Right, Ctrl+Left/Right),
// skipping over any break characters the cursor already sits next to before
// crossing the adjacent word — same word definition as tab completion.
function prevWordStart(s: string, pos: number): number {
  let i = pos;
  while (i > 0 && WORD_BREAK_CHARS.indexOf(s[i - 1]) !== -1) i--;
  return findWordStart(s, i);
}

function nextWordEnd(s: string, pos: number): number {
  let i = pos;
  while (i < s.length && WORD_BREAK_CHARS.indexOf(s[i]) !== -1) i++;
  while (i < s.length && WORD_BREAK_CHARS.indexOf(s[i]) === -1) i++;
  return i;
}

function longestCommonPrefix(strs: string[]): string {
  if (strs.length === 0) return "";
  let prefix = strs[0];
  for (let i = 1; i < strs.length && prefix; i++) {
    let j = 0;
    while (j < prefix.length && j < strs[i].length && prefix[j] === strs[i][j]) j++;
    prefix = prefix.slice(0, j);
  }
  return prefix;
}

// Mirrors the native REPL's display behavior: when showing an ambiguous
// match list, strip the prefix shared by all matches up to its last '.' so
// a list of List methods shows "map filter each" rather than repeating
// "List." on every entry — display-only, doesn't affect what's inserted.
function stripSharedQualifierForDisplay(matches: string[], lcp: string): string[] {
  const dot = lcp.lastIndexOf(".");
  if (dot === -1) return matches;
  const stripLen = dot + 1;
  return matches.map((m) => (m.length > stripLen ? m.slice(stripLen) : m));
}

export async function mountRepl(
  container: HTMLElement,
  options: ReplMountOptions = {},
): Promise<ReplHandle> {
  const { onStatus, onFontSize } = options;

  let fontSize = loadFontSize();

  const [{ Terminal }, { FitAddon }] = await Promise.all([
    import("@xterm/xterm"),
    import("@xterm/addon-fit"),
  ]);

  const term: TerminalType = new Terminal({
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
    fontSize,
    cursorBlink: true,
    theme: { background: "#1b140a", foreground: "#d6d6e6" },
  });
  const fitAddon = new FitAddon();
  term.loadAddon(fitAddon);
  term.open(container);
  fitAddon.fit();
  const onResize = () => fitAddon.fit();
  window.addEventListener("resize", onResize);

  // Clamps, persists (best-effort), re-fits the terminal to the new cell
  // metrics, and notifies the UI. No-op when the clamped value is unchanged
  // so holding the shortcut key at a bound doesn't churn.
  function applyFontSize(size: number) {
    const clamped = Math.max(
      REPL_FONT_SIZE_MIN,
      Math.min(REPL_FONT_SIZE_MAX, Math.round(size)),
    );
    if (clamped === fontSize) return;
    fontSize = clamped;
    term.options.fontSize = clamped;
    try {
      localStorage.setItem(FONT_SIZE_KEY, String(clamped));
    } catch {
      // localStorage unavailable — size just won't persist across reloads.
    }
    fitAddon.fit();
    onFontSize?.(clamped);
  }

  // Browser-style zoom shortcuts while the terminal has focus: Cmd/Ctrl
  // +/-/0 grow, shrink, and reset the font size. Returning false hands the
  // keystroke to our handler instead of the browser's page zoom.
  term.attachCustomKeyEventHandler((e: KeyboardEvent): boolean => {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return true;
    if (e.key === "+" || e.key === "=") {
      applyFontSize(fontSize + 1);
      return false;
    }
    if (e.key === "-" || e.key === "_") {
      applyFontSize(fontSize - 1);
      return false;
    }
    if (e.key === "0") {
      applyFontSize(DEFAULT_REPL_FONT_SIZE);
      return false;
    }
    return true;
  });

  // Sync the host UI with whatever was restored (or the default) up front.
  onFontSize?.(fontSize);

  let history: string[] = [];
  try {
    history = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  } catch {
    history = [];
  }
  let historyPos = history.length;
  let draft = "";

  const saveHistory = () => {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-500)));
    } catch {
      // localStorage unavailable (private browsing etc.) — history just
      // won't persist across reloads, not fatal.
    }
  };

  let line = "";
  let cursor = 0;
  let accumulated = "";
  let prompt = PROMPT;

  const writePrompt = () => term.write(prompt);

  const redrawLine = () => {
    // One write, not two: xterm parses writes asynchronously in chunks, so a
    // separate "move cursor back" call would render the cursor at the line's
    // end for a frame before snapping back (very visible on big word-jumps).
    // Bundling the erase/rewrite/reposition into a single string lets it all
    // land in one paint.
    const back = line.length - cursor;
    term.write("\r\x1b[K" + prompt + line + (back > 0 ? `\x1b[${back}D` : ""));
  };

  // Moves the terminal cursor without rewriting any text — used for keystrokes
  // that only change the caret position (arrows, word-jumps, Home/End). Since
  // nothing is rewritten there's no flash at all. Assumes the line fits within
  // the current row (same assumption redrawLine's back-move already makes).
  const moveCursor = (to: number) => {
    const delta = to - cursor;
    if (delta > 0) term.write(`\x1b[${delta}C`);
    else if (delta < 0) term.write(`\x1b[${-delta}D`);
    cursor = to;
  };

  const setLine = (s: string) => {
    line = s;
    cursor = line.length;
    redrawLine();
  };

  onStatus?.("loading");

  // The wasm build's underlying read() syscall pulls a large fixed-size
  // chunk (looks like 1024 bytes) per call, looping its `stdin` callback
  // until either that many bytes are collected or the callback returns
  // null. Since the default handler (and a naive override) never returns
  // null except on cancel, IO.getLine ends up re-prompting via
  // window.prompt() dozens of times per line just to pad out the chunk —
  // e.g. ~85 dialogs to deliver an 11-character line.
  //
  // Fix: after handing back a full buffered line, return null exactly once
  // to end that read early with a short read (the line's actual length) —
  // POSIX read() semantics allow this and the caller only needed the one
  // line. The call after that prompts fresh, so each real IO.getLine only
  // shows one dialog.
  let stdinBuffer: number[] = [];
  let stdinNeedsPrompt = true;
  const stdin = (): number | null => {
    if (stdinBuffer.length === 0) {
      if (!stdinNeedsPrompt) {
        stdinNeedsPrompt = true;
        return null;
      }
      const result = window.prompt("Input:");
      if (result === null) return null; // user cancelled — real EOF
      stdinBuffer = Array.from(result + "\n", (c) => c.charCodeAt(0));
    }
    const code = stdinBuffer.shift() ?? null;
    if (stdinBuffer.length === 0) stdinNeedsPrompt = false;
    return code;
  };

  let session: import("@kexhq/kex").Kex;
  try {
    // Loaded from the static copy in public/kex-repl/ (see scripts/sync-kex-wasm.mjs),
    // not the bundled node_modules copy — via nativeImport (see its comment
    // above) so Vite doesn't rewrite this into a `?import`-suffixed request.
    const { Kex } = await nativeImport("/kex-repl/index.mjs");
    session = await Kex.create({ stdin });
    term.write(session.banner().replace(/\n/g, "\r\n"));
  } catch (err) {
    onStatus?.("error");
    term.writeln("\x1b[31mfailed to load the kex interpreter.\x1b[0m");
    term.writeln(String(err instanceof Error ? err.message : err));
    return {
      destroy() {
        window.removeEventListener("resize", onResize);
        term.dispose();
      },
      async pasteText() {
        // wasm never loaded — nothing to paste into.
      },
      setFontSize: applyFontSize,
      fit: () => fitAddon.fit(),
    };
  }

  const submitLine = async () => {
    term.write("\r\n");
    if (line.length > 0) {
      history.push(line);
      historyPos = history.length;
      saveHistory();
    }
    accumulated += (accumulated ? "\n" : "") + line;
    line = "";
    cursor = 0;

    if (countBlocks(accumulated) > 0) {
      prompt = CONT_PROMPT;
      writePrompt();
      return;
    }

    const src = accumulated;
    accumulated = "";
    prompt = PROMPT;

    if (src.trim().length === 0) {
      writePrompt();
      return;
    }

    const out = await session.eval(src);
    term.write(out.replace(/\n/g, "\r\n"));
    writePrompt();
  };

  const completeWord = () => {
    const start = findWordStart(line, cursor);
    const word = line.slice(start, cursor);
    const matches = session.complete(line, start, word);

    if (matches.length === 0) {
      term.write("\x07");
      return;
    }
    if (matches.length === 1) {
      const repl = matches[0];
      line = line.slice(0, start) + repl + line.slice(cursor);
      cursor = start + repl.length;
      redrawLine();
      return;
    }

    const lcp = longestCommonPrefix(matches);
    if (lcp.length > word.length) {
      line = line.slice(0, start) + lcp + line.slice(cursor);
      cursor = start + lcp.length;
      redrawLine();
      return;
    }

    const display = stripSharedQualifierForDisplay(matches, lcp);
    term.write("\r\n" + display.join("  ") + "\r\n");
    redrawLine();
  };

  term.onData((data) => {
    switch (data) {
      case "\r":
        submitLine();
        return;
      case "\t":
        completeWord();
        return;
      case "\x7f":
        if (cursor > 0) {
          line = line.slice(0, cursor - 1) + line.slice(cursor);
          cursor--;
          redrawLine();
        }
        return;
      case "\x03":
        term.write("^C\r\n");
        line = "";
        cursor = 0;
        accumulated = "";
        prompt = PROMPT;
        writePrompt();
        return;
      case "\x01":
        moveCursor(0);
        return;
      case "\x05":
        moveCursor(line.length);
        return;
      case "\x0b":
        line = line.slice(0, cursor);
        redrawLine();
        return;
      case "\x15":
        line = "";
        cursor = 0;
        redrawLine();
        return;
      case "\x17": {
        let end = cursor;
        let start = end;
        while (start > 0 && line[start - 1] === " ") start--;
        while (start > 0 && line[start - 1] !== " ") start--;
        line = line.slice(0, start) + line.slice(end);
        cursor = start;
        redrawLine();
        return;
      }
      case "\x1b\x7f": // Option/Alt+Backspace — backward-kill-word
      case "\x1b\b": {
        // Same word definition as Option+Left (prevWordStart), so delete and
        // jump agree on where a "word" starts. Unlike Ctrl+W above, which is
        // the shell-style whitespace-only rubout.
        const start = prevWordStart(line, cursor);
        if (start < cursor) {
          line = line.slice(0, start) + line.slice(cursor);
          cursor = start;
          redrawLine();
        }
        return;
      }
      case "\x1b[A":
        if (historyPos > 0) {
          if (historyPos === history.length) draft = line;
          historyPos--;
          setLine(history[historyPos]);
        }
        return;
      case "\x1b[B":
        if (historyPos < history.length) {
          historyPos++;
          setLine(historyPos === history.length ? draft : history[historyPos]);
        }
        return;
      case "\x1b[C":
        if (cursor < line.length) moveCursor(cursor + 1);
        return;
      case "\x1b[D":
        if (cursor > 0) moveCursor(cursor - 1);
        return;
      case "\x1b[1;3D": // Option/Alt+Left
      case "\x1b[1;5D": // Ctrl+Left
        moveCursor(prevWordStart(line, cursor));
        return;
      case "\x1b[1;3C": // Option/Alt+Right
      case "\x1b[1;5C": // Ctrl+Right
        moveCursor(nextWordEnd(line, cursor));
        return;
      case "\x1b[H":
      case "\x1b[1~":
        moveCursor(0);
        return;
      case "\x1b[F":
      case "\x1b[4~":
        moveCursor(line.length);
        return;
    }
    if (data >= " ") {
      line = line.slice(0, cursor) + data + line.slice(cursor);
      cursor += data.length;
      redrawLine();
    }
  });

  onStatus?.("ready");
  writePrompt();
  term.focus();

  const pasteText = async (text: string) => {
    container.scrollIntoView({ behavior: "smooth", block: "center" });
    term.focus();
    const lines = text.replace(/\n$/, "").split("\n");
    for (const l of lines) {
      line = l;
      cursor = line.length;
      redrawLine();
      await submitLine();
    }
  };

  const destroy = () => {
    window.removeEventListener("resize", onResize);
    session.destroy();
    term.dispose();
  };

  window.addEventListener("pagehide", destroy, { once: true });

  return { destroy, pasteText, setFontSize: applyFontSize, fit: () => fitAddon.fit() };
}
