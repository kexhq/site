export interface Example {
  slug: string;
  title: string;
  tagline: string;
  category: "Basics" | "Types" | "Control" | "Effects" | "DSL";
  /** Repo-relative path this example is drawn from (e.g. "examples/hello.kex"). */
  source: string;
  code: string;
  output?: string;
}

/**
 * Curated, hand-verified snippets drawn from the Kex examples in the language
 * repo. Kept self-contained and short so they read well on a landing page and
 * in an examples gallery.
 */
export const EXAMPLES: Example[] = [
  {
    slug: "hello",
    title: "Hello, world",
    tagline: "The shape of a Kex program — `main` is the entry point.",
    category: "Basics",
    source: "examples/hello.kex",
    code: `main do
  IO.printLine("Hello, world!")
end`,
    output: "Hello, world!",
  },
  {
    slug: "vectors",
    title: "Records, operators, UFCS",
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

  let next = position + velocity * 2.0
  IO.printLine("next position: \${next.to(String)}")
end`,
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
    (_, _) -> n.to(String)
  end
end

main do
  (1..15).map(&.fizzBuzz).each { |s| IO.printLine(s) }
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
Buzz
11
Fizz
13
14
FizzBuzz`,
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
    output: "listening on 8080",
  },
  {
    slug: "purity",
    title: "Pure vs foul",
    tagline:
      "Pure code can’t call foul code. The compiler rejects it before the program ever runs.",
    category: "Effects",
    source: "README.md",
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
`


  },
  {
    slug: "streams",
    title: "Lazy, infinite streams",
    tagline:
      "Build the naturals, filter into primes, and take only what you need — nothing runs until you consume it.",
    category: "Control",
    source: "examples/streams.kex",
    code: `let naturals = Stream.Sequence(from: 0) { | n | n + 1 }

let primes = Stream.Sequence(from: 2) { | n | n + 1 }
  .filter do | n |
  (2..n - 1).all ? { | d | n.modulo(d) != 0 }
end

main do
  primes.take(8).each { | p | IO.printLine(p.to(String)) }
end`,
    output: `2
3
5
7
11
13
17
19`,
  },
  {
    slug: "currying",
    title: "Currying & partial application",
    tagline:
      "`~func(args)` builds a partial. `_` marks an open slot. Saturate all slots and it just runs.",
    category: "Basics",
    source: "README.md",
    code: `let add(a, b) = a + b
let multiply(a, b) = a * b

let inc = ~add(1)
let double = ~multiply(2)

main do
  IO.printLine([1, 2, 3].map(~multiply(10)).to(String))
  IO.printLine((1..100).reduce(0, ~(+)).to(String))
IO.printLine(inc(41).to(String))
end`,
    output: `[10, 20, 30]
5050
42`,
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

  list.push!(6)
  list.filter!(&.even ?)
list.map! { | x | x * 10 }

IO.printLine(list.to(String))
end`,
    output: "[20, 40, 60]",
  },
  {
    slug: "router",
    title: "DSL-friendly routers",
    tagline:
      "Block args make library code read like language keywords — routing included.",
    category: "DSL",
    source: "README.md",
    code: `let app = Http.routes do
  get "/" do | req |
  Response.ok("Welcome")
  end

  get "/users/:id" do | req |
  match UserService.find(req.params.id) do
  Just(user) -> Response.json(user)
      None -> Response.notFound("user not found")
    end
end

  post "/users" do | req |
  let user = UserService.create(req.body) ?
    Response.created(user)
  end
end`,
  },
];
