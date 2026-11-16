import React from "react";
import { Risk } from "../type";

import View from "./view";
import TransparencyUserInfo from "./transparency-user-information";
import HumanOversight from "./human-oversight";
import BiasMonitoringTab from "./bias-monitoring-mitigation/bias-monitoring-mitigation-tab";
import Explainability from "./explainability";
import EnvironmentalImpact from "./environmental-impact";
import FairnessChecks from "./bias-and-fairness/FairnessChecks";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/** Same flat underline tabs as the Controls page and AI Radar. */
const UNDERLINE_TAB =
  "h-auto flex-none rounded-none border-0 border-b-2 border-transparent bg-transparent px-4 py-2 text-muted-foreground shadow-none data-[state=active]:border-muted-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none dark:data-[state=active]:border-muted-foreground dark:data-[state=active]:bg-transparent";

export default function Tab({ risk }: { risk: Risk }) {
  // Assessment tabs apply to serious risks: High and Critical.
  if (risk.riskLevel !== "High" && risk.riskLevel !== "Critical") {
    return <View risk={risk} />;
  }
  return (
    <>
      <Tabs defaultValue="risks" className="w-full">
        <TabsList className="mb-4 h-auto w-full flex-wrap justify-start gap-1 rounded-none border-b bg-transparent p-0">
          <TabsTrigger value="risks" className={UNDERLINE_TAB}>
            Risk Details
          </TabsTrigger>
          <TabsTrigger value="transparency" className={UNDERLINE_TAB}>Transparency</TabsTrigger>
          <TabsTrigger value="human-oversight" className={UNDERLINE_TAB}>Human Oversight</TabsTrigger>
          <TabsTrigger value="bias-fairness" className={UNDERLINE_TAB}>Bias & Fairness</TabsTrigger>
          <TabsTrigger value="bias-monitoring" className={UNDERLINE_TAB}>Bias Monitoring</TabsTrigger>
          <TabsTrigger value="explainability" className={UNDERLINE_TAB}>Explainability</TabsTrigger>
          <TabsTrigger value="environmental-impact" className={UNDERLINE_TAB}>
            Environmental Impact
          </TabsTrigger>
        </TabsList>

        <TabsContent value="risks" className="space-y-6">
          <View risk={risk} />
        </TabsContent>

        <TabsContent value="transparency" className="space-y-6">
          <TransparencyUserInfo />
        </TabsContent>

        <TabsContent value="human-oversight" className="space-y-6">
          <HumanOversight />
        </TabsContent>

        <TabsContent value="bias-fairness" className="space-y-6">
          <FairnessChecks riskId={risk.id} />
        </TabsContent>

        <TabsContent value="bias-monitoring" className="space-y-6">
          <BiasMonitoringTab />
        </TabsContent>

        <TabsContent value="explainability" className="space-y-6">
          <Explainability />
        </TabsContent>

        <TabsContent value="environmental-impact" className="space-y-6">
          <EnvironmentalImpact />
        </TabsContent>
      </Tabs>
    </>
  );
}
