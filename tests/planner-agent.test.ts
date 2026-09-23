import { describe, expect, it, vi } from "vitest";
import { PlannerAgent, TOOL_REGISTRY } from "../packages/agent-orchestrator/src/index.js";

describe("PlannerAgent", () => {
  it("normalizes a valid LLM plan and enforces every required tool", async () => {
    const model = { generatePlan: vi.fn().mockResolvedValue({ objective: "Assess AKRA", steps: [{ tool: "sectors.company-profile", description: "Collect profile", rationale: "Identify sector and coverage." }] }) };
    const agent = new PlannerAgent(model, { profileLookup: async () => ({ ticker: "AKRA", sector: "Energy" }) });

    const plan = await agent.createPlan({ ticker: "akra" });

    expect(plan.source).toBe("llm");
    expect(plan.objective).toBe("Assess AKRA");
    expect(model.generatePlan).toHaveBeenCalledWith(expect.objectContaining({ ticker: "AKRA", sector: "Energy" }));
    const ids = plan.steps.map((step) => step.tool);
    for (const tool of TOOL_REGISTRY.filter((item) => item.required)) expect(ids).toContain(tool.id);
    expect(plan.steps.every((step) => step.rationale && step.rationale.length > 0)).toBe(true);
  });

  it("falls back to the deterministic tool registry plan when the LLM output fails Zod validation", async () => {
    const model = { generatePlan: vi.fn().mockResolvedValue({ objective: "", steps: "not-an-array" }) };
    const agent = new PlannerAgent(model, { profileLookup: async () => ({ ticker: "AKRA" }) });

    const plan = await agent.createPlan({ ticker: "AKRA" });

    expect(plan.source).toBe("fallback");
    expect(plan.steps.some((step) => step.skipped && step.skipReason)).toBe(true);
    for (const tool of TOOL_REGISTRY.filter((item) => item.required)) expect(plan.steps.map((step) => step.tool)).toContain(tool.id);
  });

  it("drops hallucinated tool ids that are not in the registry", async () => {
    const model = { generatePlan: vi.fn().mockResolvedValue({ objective: "X", steps: [{ tool: "made.up.tool", description: "d", rationale: "r" }] }) };
    const agent = new PlannerAgent(model);

    const plan = await agent.createPlan({ ticker: "AKRA" });

    expect(plan.steps.map((step) => step.tool)).not.toContain("made.up.tool");
    expect(plan.steps.length).toBeGreaterThan(0);
  });

  it("records skipped optional tools with a transparent reason", async () => {
    const agent = new PlannerAgent({ generatePlan: vi.fn().mockResolvedValue(undefined) }, { profileLookup: async () => ({ ticker: "AKRA", sector: "Energy" }) });
    const plan = await agent.createPlan({ ticker: "AKRA" });
    const skipped = plan.steps.filter((step) => step.skipped);
    expect(skipped.length).toBeGreaterThan(0);
    expect(skipped.every((step) => typeof step.skipReason === "string" && step.skipReason.length > 0)).toBe(true);
  });
});