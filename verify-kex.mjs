import { Kex } from "@kexhq/kex";
const session = await Kex.create();
async function run(label, code) {
  const out = await session.eval(code);
  const clean = out.replace(/\x1b\[[0-9;]*m/g, "").replace(/\r/g, "").trim();
  console.log("\n## " + label);
  console.log(code);
  console.log(">>>", JSON.stringify(clean));
}

await run("match-value-ml", `match 2 do
  1 -> "one"
  2 -> "two"
  _ -> "many"
end`);

await run("match-tuple-ml", `match (3, 4) do
  (a, b) -> a + b
end`);

await run("match-just-ml", `match Just(5) do
  Just(x) -> x
  None -> 0
end`);

await run("match-none-ml", `match None do
  Just(x) -> x
  None -> 0
end`);

await run("pipeline-binding", `let nums = [1, 2, 3, 4]
nums.filter(&.even?).map { |n| n * n }.sum`);

await run("oddsquares-binding", `let nums = 1..10
nums.filter(&.odd?).map { |n| n * n }.sum`);

await run("range-binding", `let r = 1..10
r.filter(&.odd?).sum`);
