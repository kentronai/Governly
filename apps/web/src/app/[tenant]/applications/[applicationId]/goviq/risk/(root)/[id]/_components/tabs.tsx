import React from "react";
import { Risk } from "../type";
import View from "./view";

// ponytail: Transparency, Human Oversight, Bias & Fairness, Bias Monitoring, Explainability and
// Environmental Impact tabs are hidden for now (their components still live in this folder).
// Re-add them here as Tabs when those assessments are ready.
export default function Tab({ risk }: { risk: Risk }) {
  return <View risk={risk} />;
}
