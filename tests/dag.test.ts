import { describe, expect, it, vi } from "vitest";
import { runDag } from "../packages/agent-orchestrator/src/index.js";

describe("runDag", () => {
  it("executes independent nodes concurrently and dependent nodes afterwards", async () => {
    const calls: string[] = [];
    let releaseRoots: () => void = () => {};
    const rootsDone = new Promise<void>((resolve) => { releaseRoots = resolve; });

    const dagPromise = runDag<number>([
      { id: "a", run: async () => { calls.push("a"); await rootsDone; return 1; } },
      { id: "b", run: async () => { calls.push("b"); await rootsDone; return 2; } },
      { id: "c", dependsOn: ["a", "b"], run: async () => { calls.push("c"); return 3; } },
    ]);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls.sort()).toEqual(["a", "b"]);
    releaseRoots();
    const result = await dagPromise;

    expect(result.results).toEqual({ a: 1, b: 2, c: 3 });
    expect(result.order.indexOf("c")).toBe(2);
  });

  it("detects dependency cycles", async () => {
    await expect(runDag<number>([
      { id: "a", dependsOn: ["b"], run: async () => 1 },
      { id: "b", dependsOn: ["a"], run: async () => 2 },
    ])).rejects.toThrow(/cycle/);
  });

  it("rejects unknown dependencies", async () => {
    await expect(runDag<number>([{ id: "a", dependsOn: ["missing"], run: async () => 1 }])).rejects.toThrow(/unknown node/);
  });

  it("runs a five-node parallel collection layer", async () => {
    const run = vi.fn(async (id: string) => id);
    const result = await runDag<string>(["profile", "financials", "market", "peers", "news"].map((id) => ({ id, run: () => run(id) })));
    expect(run).toHaveBeenCalledTimes(5);
    expect(result.order).toHaveLength(5);
  });
});