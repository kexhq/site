// Multi-program persistence for the playground. The store is a single
// localStorage entry holding a list of named programs plus the id of the
// active one (or null when a transient tab is active — examples, shared
// links, fresh "+" tabs).
//
// Pure localStorage I/O — no DOM, no Monaco, no Astro. Page code is
// responsible for calling these functions on the right events; this module
// just owns the data shape and the storage envelope (including the 50-program
// cap).

const STORE_KEY = "kex-playground-v2";

/** Soft cap. Going over prunes the oldest non-active program. localStorage's
    5MB per-origin budget comfortably fits ~50 typical Kex programs even
    uncompressed; we lz-compress share URLs elsewhere but store programs raw
    so a future "export" can read them straight out of DevTools. */
export const MAX_PROGRAMS = 50;

export interface SavedProgram {
  /** Stable across renames. crypto.randomUUID() where available, with a
      timestamp-based fallback for older browsers / jsdom. */
  id: string;
  name: string;
  code: string;
  /** epoch ms — drives "last edited" display and prune order. */
  updatedAt: number;
}

export interface PlaygroundStore {
  version: 1;
  programs: SavedProgram[];
  /** id of the saved program currently loaded, or null when a transient tab
      is active. The page also tracks transient tabs in-memory only. */
  activeId: string | null;
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `pg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function emptyStore(): PlaygroundStore {
  return { version: 1, programs: [], activeId: null };
}

/** Reads the store. Returns an empty store (not null) when nothing's saved
    yet, so callers don't have to null-check. */
export function loadStore(): PlaygroundStore {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORE_KEY);
  } catch {
    return emptyStore();
  }

  if (raw) {
    try {
      const parsed = JSON.parse(raw) as PlaygroundStore;
      if (parsed && parsed.version === 1 && Array.isArray(parsed.programs)) {
        return parsed;
      }
    } catch {
      // Corrupt JSON — fall through to empty store.
    }
  }

  return emptyStore();
}

/** Writes the whole store. Enforces the cap (prune oldest non-active) and
    swallows quota errors — callers don't need to try/catch. Returns the
    possibly-pruned store so callers can update their in-memory copy. */
export function saveStore(store: PlaygroundStore): PlaygroundStore {
  let next = store;
  if (next.programs.length > MAX_PROGRAMS) {
    // Keep the active program no matter what; prune oldest among the rest.
    const active = next.programs.find((p) => p.id === next.activeId);
    const rest = next.programs
      .filter((p) => p.id !== next.activeId)
      .sort((a, b) => a.updatedAt - b.updatedAt);
    const keep = rest.slice(rest.length - (MAX_PROGRAMS - 1));
    next = {
      ...next,
      programs: active ? [...keep, active] : keep,
    };
  }
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(next));
  } catch {
    // Quota exceeded, private browsing, etc. The in-memory state is intact
    // for the rest of the session; the user just won't see the change after
    // a reload. Surfacing this is the page's job (it has the DOM).
  }
  return next;
}

/** Creates a new saved program and returns it. Does NOT touch `activeId` —
    the page sets that separately when the tab is switched to. */
export function createProgram(
  name: string,
  code: string,
): { store: PlaygroundStore; program: SavedProgram } {
  const store = loadStore();
  const program: SavedProgram = {
    id: newId(),
    name,
    code,
    updatedAt: Date.now(),
  };
  const next = saveStore({
    ...store,
    programs: [...store.programs, program],
  });
  return { store: next, program };
}

/** Updates a program's code and bumps `updatedAt`. No-op if the id isn't
    found (e.g. the page called touch on a transient tab by mistake). */
export function touchProgram(
  id: string,
  code: string,
): PlaygroundStore {
  const store = loadStore();
  const programs = store.programs.map((p) =>
    p.id === id ? { ...p, code, updatedAt: Date.now() } : p,
  );
  return saveStore({ ...store, programs });
}

/** Renames a program. Returns the updated store. */
export function renameProgram(
  id: string,
  name: string,
): PlaygroundStore {
  const store = loadStore();
  const trimmed = name.trim() || "Untitled";
  const programs = store.programs.map((p) =>
    p.id === id ? { ...p, name: trimmed } : p,
  );
  return saveStore({ ...store, programs });
}

/** Removes a program from the store. Clears `activeId` if it pointed at the
    deleted program — the page handles opening a fresh transient tab in that
    case. */
export function deleteProgram(id: string): PlaygroundStore {
  const store = loadStore();
  const programs = store.programs.filter((p) => p.id !== id);
  const activeId = store.activeId === id ? null : store.activeId;
  return saveStore({ ...store, programs, activeId });
}

/** Sets `activeId` without touching program contents. */
export function setActive(id: string | null): PlaygroundStore {
  const store = loadStore();
  return saveStore({ ...store, activeId: id });
}
