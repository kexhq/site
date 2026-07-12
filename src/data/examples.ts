// Most gallery snippets below are already complete runnable programs, so they
// ship as-is to the playground. The one exception is `purity`, whose gallery
// snippet is illustrative-but-not-runnable; for that one, `fullCode` overrides
// `code` with the real `purity.kex` source (loaded via Vite's `?raw` suffix,
// which yields the file's contents as a string at build time).
import purityFull from "~/examples/purity.kex?raw";

export interface Example {
  slug: string;
  title: string;
  tagline: string;
  category: "Basics" | "Types" | "Control" | "Effects" | "DSL";
  /** Repo-relative path this example is drawn from (e.g. "examples/hello.kex"). */
  source: string;
  /**
   * Snippet shown on the gallery / landing page and used as the playground
   * load by default. Kept tight for readability but is itself a complete
   * program in every case below.
   */
  code: string;
  /**
   * Optional override for the playground load and "Open in Playground" share
   * links. Set only when the gallery snippet is illustrative-but-not-runnable
   * and a real source file exists to load instead. Falls back to `code` when
   * absent (the common case).
   */
  fullCode?: string;
  output?: string;
}

/**
 * Picks the `.kex` filename to label a playground tab / share link with.
 * Prefers the real source basename when there is one; falls back to
 * `<slug>.kex` for README-sourced examples that don't have a real file.
 */
export function exampleFilename(ex: Pick<Example, "slug" | "source">): string {
  const base = ex.source.split("/").pop() ?? "";
  if (base.endsWith(".kex")) return base;
  return `${ex.slug}.kex`;
}

/**
 * Curated, hand-verified snippets drawn from the Kex examples in the language
 * repo. Most are the whole program; a few are trimmed for gallery readability
 * (with `fullCode` pointing at the runnable source where needed).
 */
export const EXAMPLES: Example[] = [
  {
    slug: "hello",
    title: "Hello, world",
    tagline: "Your first Kex program, prints 'Hello, world!' to the console.",
    category: "Basics",
    source: "examples/hello.kex",
    code: `main do
  IO.printLine("Hello, world!")
end`,
    output: "Hello, world!",
  },
  {
    slug: "fact",
    title: "Pattern matching with functions",
    tagline: "Might be your first introduction to functional pattern matching...",
    category: "Basics",
    source: "examples/fact.kex",
    code: `factorial : Integer -> Integer
let factorial(1) = 1
let factorial(n) = n * factorial(n - 1)

main do
  IO.printLine(factorial(4))
end`,
    output: "24",
  },
  {
    slug: "makepat",
    title: "Pattern matching on the first parameter",
    tagline: "Might be your first real Kexample.",
    category: "Basics",
    source: "examples/head.kex",
    code: `make [X] do
  head :> X?
  let head(@[]) = None
  let head(@[x | _]) = Just(x)

  rest :> This
  let rest(@[]) = []
  let rest(@[_ | xs]) = xs
end

main do
  let list = [1, 2, 3]
  IO.printLine(list.head)   # same as: head(list)
  IO.printLine([].head)     # same as: head([])

  IO.printLine(list.rest)
end
`,
    output: `Just(1)
None
[2, 3]
    `,
  },
  {
    slug: "vectors",
    title: "Records, operators, chaining",
    tagline:
      "Define a record, attach behavior with `make`, overload `+` and `*`, and chain calls.",
    category: "Types",
    source: "examples/vectors_advanced.kex",
    code: `record Vector2D do
  x : Float
  y : Float
end

make Vector2D do
  let +(other: This) -> This do
    return Vector2D { x: @x + other.x, y: @y + other.y }
  end

  let *(factor: Float) -> This do
    return Vector2D { x: @x * factor, y: @y * factor }
  end

  let to(String) -> String do
    return "(\${@x}, \${@y})"
  end
end

main do
  let position = Vector2D { x: 3.0, y: 4.0 }
  let velocity = Vector2D { x: 1.0, y: -0.5 }

  let combined = position + velocity * 2.0
  IO.printLine("next position: \${combined.to(String)}")
end`,
  // The trimmed snippet above shows just the operator-overload core; the
  // real file has static constructors, polar coordinates, lerp, rotate,
  // dot product, etc. — a separate showcase, not the unabridged version, so
  // we don't load it as `fullCode`.
  output: "next position: (5.0, 3.0)",
  },
  {
    slug: "fizzbuzz",
    title: "Pattern matching as control flow",
    tagline:
      "Branch on a tuple of remainders with guards and wildcards — readable from top to bottom.",
    category: "Control",
    source: "examples/fizzbuzz_pattern_matching.kex",
    code: `let fizzBuzz(n: Integer) -> String do
  match (n.modulo(3), n.modulo(5)) do
    (0, 0) -> "FizzBuzz"
    (0, _) -> "Fizz"
    (_, 0) -> "Buzz"
    (_, _) -> n.to(String).or("")
  end
end

main do
  (1..100).map(&.fizzBuzz).each { |s| IO.printLine(s) }
end`,
    output: `1
2
Fizz
4
Buzz
Fizz
7
8
Fizz
...`,
  },
  {
    slug: "result",
    title: "Result, Optional, and `?`",
    tagline:
      "Model fallible flows with `Result`, propagate failures with `?`, and pattern-match on what comes back.",
    category: "Effects",
    source: "examples/error_handling.kex",
    code: `type ParseError = InvalidFormat(String) | Overflow | EmptyInput

let parsePort(s: String) -> Result<Int, ParseError> do
  return Error(EmptyInput) if s.empty?

  match Integer.parse(s) do
    Ok(n)    -> do
      return Error(Overflow) if n > 65535

      return Ok(n)
    end
    Error(_) -> Error(InvalidFormat(s))
  end
end

main do
  match parsePort("8080") do
    Ok(port)    -> IO.printLine("listening on \${port}")
    Error(why)  -> IO.printLine("bad port: \${why}")
  end
end`,
    // The repo's error_handling.kex has more (aspirational, not-yet-stdlib)
    // functions below this point; they don't run in the wasm interpreter, so
    // we ship the trimmed-but-complete version above as the playground load.
    output: "listening on 8080",
  },
  {
    slug: "purity",
    title: "Pure vs foul",
    tagline:
      "Pure code can’t call foul code. The compiler rejects it before the program ever runs.",
    category: "Effects",
    source: "examples/purity.kex",
    code:
      `# Pure function, no side effects, can be called from anywhere
let wordCountFrom(lines: String[]) -> Integer do
  let words = lines.map do |line|
    line.split(" ").count { |w| !w.empty? }  # words per line
  end

  words.sum
end
      
# A foul, impure function with side-effect.
# Must be called from other foul functions.
foul wordCount(path: String) -> [Integer] do
  return if !File.exists?(path)

  let file_lines = File.lines(path).or([])

  let words = wordCountFrom(lines: file_lines)
  let lines = file_lines.count
  let bytes = File.size(path).or(0)

  [lines, words, bytes]
end

# ...
`,
    // The gallery snippet above is hand-written to illustrate the concept;
    // the runnable program in the repo is the simpler compute/readConfig
    // pair from examples/purity.kex — that's what the playground loads.
    fullCode: purityFull,
  },
  {
    slug: "currying",
    title: "Currying & partial application",
    tagline:
      "Use the tilde `~` for currying a function. `_` marks an open slot (only required if it's not the next one).",
    category: "Basics",
    source: "README.md",
    code: `let add(a, b) = a + b
let multiply(a, b) = a * b

let inc = ~add(1)
let double = ~multiply(2)

main do
  let multipled = [1, 2, 3].map(~multiply(10))
  IO.printLine(multipled)

  let summed = (1..100).reduce(0, ~(+))
  IO.printLine(summed)
end`,
    output: `[10, 20, 30]
5050
`,
  },
  {
    slug: "traits",
    title: "Traits with defaults",
    tagline:
      "Declare a contract, give it a default, implement it for each type, override where you want to.",
    category: "Types",
    source: "examples/traits.kex",
    code: `trait Shape do
  area :> Float
  perimeter :> Float

  let describe = "area=\${this.area}" # default implementation
end

record Circle do
  radius: Float
end

make Circle, implement: Shape do
  let area = Math.PI * @radius * @radius
  let perimeter = 2.0 * Math.PI * @radius
end

main do
  let c = Circle { radius: 5.0 }
  IO.printLine(c.describe)
end`,
    output: "area=78.53981633974483",
  },
  {
    slug: "mutation",
    title: "Local mutation with `var` and `!`",
    tagline:
      "`!` rebinds a `var` to the method’s updated value. Frozen `let` bindings refuse it.",
    category: "Basics",
    source: "examples/mutating.kex",
    code: `main do
  var list = [1, 2, 3, 4, 5]

  list.push!(6)             # list = [1, 2, 3, 4, 5, 6]
  list.filter!(&.even?)     # list = [2, 4, 6]
  list.map! { |x| x * 10 }  # list = [20, 40, 60]

  IO.printLine(list.to(String).or(""))
end`,
    // The repo's mutating.kex has more (countErrors, an accumulator Process)
    // below this point; the trimmed main above is the runnable core.
    output: "[20, 40, 60]",
  },
  {
    slug: "router",
    title: "DSL-friendly language",
    tagline:
      "Block args make library code read like language keywords — routing included.",
    category: "DSL",
    source: "README.md",
    code: `let app = Http.routes do
  get "/" do |req|
    Response.ok("Welcome")
  end

  get "/users/:id" do |req|
    match UserService.find(req.params.id) do
      Just(user) -> Response.json(user)
      None -> Response.notFound("user not found")
    end
  end

    post "/users" do |req|
    let user = UserService.create(req.body)
    return Response.created(user) if user.ok?

    return Response.error("error while creating user")
  end
end`,
  },
];
