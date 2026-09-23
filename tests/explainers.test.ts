import { describe, expect, it } from "vitest";
import { EXPLAINERS, explainerKeys } from "../apps/web/lib/explainers";

describe("metric explainers", () => {
  it("provides a definition and human analogy for every metric", () => {
    for (const key of explainerKeys()) {
      expect(EXPLAINERS[key].definition.length).toBeGreaterThan(10);
      expect(EXPLAINERS[key].analogy.length).toBeGreaterThan(10);
    }
  });

  it("covers the required institutional explainer set", () => {
    const required = ["divergence", "cfoNi", "workingCapitalDrag", "residual", "dso", "reverseDcf", "wacc", "haircut", "bookValue", "roe", "coe", "nim", "npl"];
    for (const key of required) expect(explainerKeys()).toContain(key);
  });
});