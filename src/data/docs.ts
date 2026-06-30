export interface DocEntry {
  title: string;
  slug: string; // /docs/<slug>
  blurb?: string;
}
export interface DocSection {
  heading: string;
  entries: DocEntry[];
}

export const DOCS_NAV: DocSection[] = [
  {
    heading: "Getting started",
    entries: [
      { title: "Overview", slug: "overview", blurb: "What kex is, and isn't." },
      { title: "Install", slug: "../install", blurb: "Build from source." },
    ],
  },
  {
    heading: "Language",
    entries: [
      { title: "Syntax", slug: "syntax", blurb: "Structure of a kex program." },
      { title: "Types", slug: "types", blurb: "Records, sum types, Optional, Result." },
      { title: "Functions", slug: "functions", blurb: "Lambdas, multi-clause, UFCS." },
      { title: "Pattern matching", slug: "pattern-matching", blurb: "match, destructuring, guards." },
      { title: "Effects & purity", slug: "effects", blurb: "foul, ?, and the effect boundary." },
      { title: "Traits", slug: "traits", blurb: "Contracts with defaults." },
    ],
  },
  {
    heading: "Reference",
    entries: [
      { title: "Prelude", slug: "prelude", blurb: "Lists, maps, streams, IO, Math." },
      { title: "Operators", slug: "operators", blurb: "Operator table & overloading." },
    ],
  },
];

export const ALL_DOC_ENTRIES = DOCS_NAV.flatMap((s) => s.entries);

/** Ordered list of docs pages (for prev/next navigation). */
export const DOC_ORDER = DOCS_NAV.flatMap((s) => s.entries).filter(
  (e) => !e.slug.startsWith("../")
);
