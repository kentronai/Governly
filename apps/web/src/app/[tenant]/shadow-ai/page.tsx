import { listMachineScans } from "@/lib/actions/shadow-ai";
import { ShadowAI } from "@/components/shadow-ai/ShadowAI";

export default async function ShadowAIPage() {
  const machines = await listMachineScans();
  return (
    <div className="p-6">
      <ShadowAI initialMachines={machines} />
    </div>
  );
}
