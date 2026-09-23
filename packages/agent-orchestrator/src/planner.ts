import { z } from "zod";
import type { ResearchPlan, ResearchPlanStep, ResearchPlanner } from "./index";

export type ToolCategory = "sectors-adapter" | "finance-engine" | "quality-scorecard";

export interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  category: ToolCategory;
  required: boolean;
}

export const TOOL_REGISTRY: ToolDefinition[] = [
  { id: "sectors.company-profile", name: "Company profile", description: "Issuer identity, sector, and non-financial coverage classification.", category: "sectors-adapter", required: true },
  { id: "sectors.financial-statements", name: "Annual financial statements", description: "Multi-period revenue, earnings, cash flow, and working-capital inputs.", category: "sectors-adapter", required: true },
  { id: "sectors.daily-market-data", name: "Market snapshot", description: "Last price and shares outstanding for reverse DCF and per-share value.", category: "sectors-adapter", required: true },
  { id: "sectors.subsector-peers", name: "Subsector peers", description: "Peer set for relative context; optional for a first-pass valuation.", category: "sectors-adapter", required: false },
  { id: "finance.forensics", name: "Forensic earnings-quality checks", description: "CFO-to-NI conversion and receivables-divergence signals.", category: "finance-engine", required: true },
  { id: "finance.cash-flow-bridge", name: "Cash flow bridge", description: "Net income to FCFF decomposition highlighting the working-capital drag.", category: "finance-engine", required: true },
  { id: "finance.reverse-dcf", name: "Reverse DCF", description: "Market-implied terminal growth versus historical fundamental growth.", category: "finance-engine", required: true },
  { id: "quality.earnings-scorecard", name: "Earnings quality scorecard", description: "Multi-period DSO, accrual intensity, and composite grade.", category: "quality-scorecard", required: true },
];

export interface PlannerProfile {
  ticker: string;
  sector?: string;
}

export interface PlannerModel {
  generatePlan(input: { ticker: string; sector?: string; tools: ToolDefinition[] }): Promise<unknown>;
}

export const plannerStepSchema = z.object({
  tool: z.string().min(1),
  description: z.string().min(1),
  rationale: z.string().min(1),
  skipped: z.boolean().optional(),
  skipReason: z.string().optional(),
});

export const plannerPlanSchema = z.object({
  objective: z.string().min(1),
  steps: z.array(plannerStepSchema).min(1),
});

export type PlannerPlanOutput = z.infer<typeof plannerPlanSchema>;

export interface PlannerAgentOptions {
  profileLookup?: (ticker: string) => Promise<PlannerProfile>;
}

export class PlannerAgent implements ResearchPlanner {
  constructor(
    private readonly model: PlannerModel,
    private readonly options: PlannerAgentOptions = {},
  ) {}

  async createPlan(input: { ticker: string; sector?: string }): Promise<ResearchPlan> {
    const ticker = input.ticker.trim().toUpperCase();
    let sector = input.sector;
    if (!sector && this.options.profileLookup) {
      try {
        sector = (await this.options.profileLookup(ticker)).sector;
      } catch {
        sector = undefined;
      }
    }

    let raw: unknown;
    try {
      raw = await this.model.generatePlan({ ticker, sector, tools: TOOL_REGISTRY });
    } catch {
      raw = undefined;
    }

    const parsed = plannerPlanSchema.safeParse(raw);
    if (!parsed.success) return this.fallbackPlan(ticker, sector);
    return this.normalizePlan(parsed.data, sector);
  }

  private normalizePlan(output: PlannerPlanOutput, sector?: string): ResearchPlan {
    const known = new Map(TOOL_REGISTRY.map((tool) => [tool.id, tool]));
    const steps: ResearchPlanStep[] = [];
    for (const step of output.steps) {
      const tool = known.get(step.tool);
      if (!tool) continue;
      steps.push({
        id: tool.id,
        description: step.description,
        tool: tool.id,
        rationale: step.rationale,
        skipped: step.skipped ?? false,
        skipReason: step.skipped ? step.skipReason ?? "Skipped by planner." : undefined,
      });
    }
    for (const tool of TOOL_REGISTRY) {
      if (tool.required && !steps.some((step) => step.tool === tool.id)) {
        steps.push({
          id: tool.id,
          description: tool.description,
          tool: tool.id,
          rationale: `${tool.name} is required by policy and was added automatically for an auditable valuation.`,
          skipped: false,
        });
      }
    }
    return { objective: output.objective, steps, source: "llm" };
  }

  private fallbackPlan(ticker: string, sector?: string): ResearchPlan {
    const steps: ResearchPlanStep[] = TOOL_REGISTRY.map((tool) =>
      tool.required
        ? {
            id: tool.id,
            description: tool.description,
            tool: tool.id,
            rationale: `${tool.name} is required for an auditable ${sector ?? "non-financial"} valuation.`,
            skipped: false,
          }
        : {
            id: tool.id,
            description: tool.description,
            tool: tool.id,
            rationale: `${tool.name} is optional for a first-pass valuation.`,
            skipped: true,
            skipReason: "Optional peer context deferred until the core valuation is reconciled.",
          },
    );
    return {
      objective: `Assess ${ticker}${sector ? ` (${sector})` : ""} with deterministic evidence, forensic checks, and valuation.`,
      steps,
      source: "fallback",
    };
  }
}