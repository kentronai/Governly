import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { complianceEvidence, db } from "@db";
import { decryptSecret } from "@/lib/server/crypto";

export async function GET(_request: Request, { params }: { params: Promise<{ evidenceId: string }> }) {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) return new Response("Unauthorized", { status: 401 });
  const { evidenceId } = await params;
  const evidence = await db.query.complianceEvidence.findFirst({
    where: and(eq(complianceEvidence.id, evidenceId), eq(complianceEvidence.tenantId, orgId), eq(complianceEvidence.isActive, true)),
  });
  if (!evidence?.fileContentBase64 || !evidence.fileName) return new Response("File not found", { status: 404 });
  const safeName = evidence.fileName.replace(/[\r\n"\\]/g, "_");
  let content: Buffer;
  try {
    content = Buffer.from(decryptSecret(evidence.fileContentBase64), "base64");
  } catch {
    return new Response("Evidence file could not be decrypted", { status: 500 });
  }
  return new Response(new Uint8Array(content), {
    headers: {
      "Content-Type": evidence.mimeType || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${safeName}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
