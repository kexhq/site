export interface Feature {
  title: string;
  blurb: string;
  icon: string; // svg path id used in FeatureCard
}

export const FEATURES: Feature[] = [
  {
    title: "UFCS & pipelines",
    blurb:
      "Uniform Function Call Syntax turns plain functions into fluent chains. `value.f(arg)` is exactly `f(value, arg)` — pick whichever reads better.",
    icon: "pipe",
  },
  {
    title: "Type-directed `make`",
    blurb:
      "Attach behavior to a type without classes or inheritance. Overload operators and methods per receiver; dispatch is resolved by type.",
    icon: "blocks",
  },
  {
    title: "Pattern matching",
    blurb:
      "Multi-clause functions, `match` expressions, destructuring, and receiver patterns handle control flow without ceremony.",
    icon: "branches",
  },
  {
    title: "Purity by default",
    blurb:
      "Functions are pure unless marked `foul`. Pure code can’t call foul code, so side effects stay visible in the shape of the program.",
    icon: "shield",
  },
  {
    title: "Records & sum types",
    blurb:
      "Product records, `type` unions, `Optional`, and `Result` model real data directly — with `?` to propagate failures cleanly.",
    icon: "types",
  },
  {
    title: "Immutable by default",
    blurb:
      "`let` bindings don’t change. `var` opts into local mutation; `!` rebinds updated values so aliases never see the change.",
    icon: "lock",
  },
  {
    title: "Lazy streams & ranges",
    blurb:
      "Infinite streams and ranges share collection-style operations, staying lazy until you materialize them with `take`.",
    icon: "stream",
  },
  {
    title: "Traits & defaults",
    blurb:
      "Declare required methods and ship default implementations. `make X implement: Trait` pulls them in — and lets you override.",
    icon: "trait",
  },
  {
    title: "DSL-friendly blocks",
    blurb:
      "`do |x| ... end` blocks and block args let library code read like built-in syntax, from HTML builders to HTTP routers.",
    icon: "braces",
  },
];
