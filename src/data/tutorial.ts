export interface TutorialEntry {
  title: string;
  slug: string; // data-lesson-panel id on /repl (no dedicated URL — see src/pages/repl.astro)
  blurb?: string;
  /** Lessons not yet written render a short "coming soon" placeholder. */
  status: "ready" | "soon";
}
export interface TutorialSection {
  heading: string;
  entries: TutorialEntry[];
}

export const TUTORIAL_NAV: TutorialSection[] = [
  {
    heading: "Basics",
    entries: [
      { title: "Hello, kex", slug: "hello-kex", blurb: "Your first program, the REPL, running files.", status: "ready" },
      { title: "Variables & types", slug: "variables", blurb: "let/var, primitive types, Optional.", status: "ready" },
      { title: "Functions", slug: "functions", blurb: "Defining functions, multi-clause, chaining.", status: "ready" },
    ],
  },
  {
    heading: "Core language",
    entries: [
      { title: "Pattern matching", slug: "pattern-matching", blurb: "match, destructuring, guards.", status: "ready" },
      { title: "Records & Result", slug: "records", blurb: "Modeling data: records, unions, fallible functions.", status: "ready" },
      { title: "Attaching behavior", slug: "make", blurb: "make, operators, no classes.", status: "ready" },
      { title: "Function chaining", slug: "pipelines", blurb: "Chaining functions like methods.", status: "ready" },
      { title: "Effects & purity", slug: "effects", blurb: "foul, ?, and what stays pure.", status: "ready" },
    ],
  },
  {
    heading: "Building things",
    entries: [
      { title: "A small project", slug: "small-project", blurb: "Put it together: a tiny end-to-end program.", status: "ready" },
    ],
  },
];
