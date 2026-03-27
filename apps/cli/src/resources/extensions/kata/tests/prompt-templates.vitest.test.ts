import { describe, it, expect } from "vitest";
import { loadPrompt } from "../prompt-loader.js";

type PromptCase = {
  name: string;
  vars: Record<string, string>;
};

const newPlanModeTemplates: PromptCase[] = [
  {
    name: "guided-add-slice",
    vars: {
      milestoneId: "M123",
      milestoneTitle: "Prompt Safety",
    },
  },
  {
    name: "guided-resequence-slices",
    vars: {
      milestoneId: "M123",
      milestoneTitle: "Prompt Safety",
    },
  },
  {
    name: "guided-revise-roadmap",
    vars: {
      milestoneId: "M123",
      milestoneTitle: "Prompt Safety",
    },
  },
  {
    name: "guided-discuss-planning",
    vars: {
      milestoneId: "M123",
      milestoneTitle: "Prompt Safety",
      currentState: "phase=planning, slices=3",
    },
  },
];

const guidedPlanTemplatesWithStateGuard: PromptCase[] = [
  {
    name: "guided-plan-milestone",
    vars: {
      milestoneId: "M001",
      milestoneTitle: "Milestone 1",
    },
  },
  {
    name: "guided-plan-slice",
    vars: {
      milestoneId: "M001",
      sliceId: "S01",
      sliceTitle: "First Slice",
    },
  },
  {
    name: "guided-add-slice",
    vars: {
      milestoneId: "M001",
      milestoneTitle: "Milestone 1",
    },
  },
  {
    name: "guided-resequence-slices",
    vars: {
      milestoneId: "M001",
      milestoneTitle: "Milestone 1",
    },
  },
  {
    name: "guided-revise-roadmap",
    vars: {
      milestoneId: "M001",
      milestoneTitle: "Milestone 1",
    },
  },
  {
    name: "guided-discuss-planning",
    vars: {
      milestoneId: "M001",
      milestoneTitle: "Milestone 1",
      currentState: "phase=planning",
    },
  },
];

describe("new plan-mode templates", () => {
  for (const template of newPlanModeTemplates) {
    it(`loads and substitutes variables for ${template.name}`, () => {
      const prompt = loadPrompt(template.name, template.vars);

      expect(prompt.length).toBeGreaterThan(0);
      for (const value of Object.values(template.vars)) {
        expect(prompt).toContain(value);
      }
      expect(prompt).not.toMatch(/\{\{[a-zA-Z][a-zA-Z0-9_]*\}\}/);
    });
  }
});

describe("state promotion guards", () => {
  for (const template of guidedPlanTemplatesWithStateGuard) {
    it(`${template.name} contains kata_update_issue_state guard`, () => {
      const prompt = loadPrompt(template.name, template.vars);
      expect(prompt).toContain("Do NOT call `kata_update_issue_state`");
    });
  }
});

describe("Linear-mode compliance", () => {
  for (const template of newPlanModeTemplates) {
    it(`${template.name} prohibits local .kata file operations`, () => {
      const prompt = loadPrompt(template.name, template.vars);
      expect(prompt).toMatch(/Do NOT.*\.kata/);
    });
  }
});

describe("error case", () => {
  it("throws when required variables are missing", () => {
    expect(() =>
      loadPrompt("guided-discuss-planning", {
        milestoneId: "M001",
        milestoneTitle: "Milestone 1",
      }),
    ).toThrow(/currentState/);
  });
});
