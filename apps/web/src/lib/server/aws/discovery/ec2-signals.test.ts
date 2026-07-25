import { hasAgentSignal } from "./ec2-signals";

describe("EC2 agent signals", () => {
  it("recognizes separator-delimited and compound agent names", () => {
    expect(hasAgentSignal("norix-agent-api", {})).toBe(true);
    expect(hasAgentSignal("streamlit-chatbotagent", {})).toBe(true);
  });

  it("recognizes the explicit NORIX tag", () => {
    expect(
      hasAgentSignal("arca-cpu-test", {
        "norix:agent": "true",
      }),
    ).toBe(true);
  });

  it("does not classify an ordinary untagged server as an agent", () => {
    expect(hasAgentSignal("customer-web-server", {})).toBe(false);
  });
});
