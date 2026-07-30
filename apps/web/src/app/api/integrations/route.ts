import { NextRequest, NextResponse } from "next/server";
import { getIntegrationsWithCatalog } from "@/lib/actions/integrations";

export async function GET(request: NextRequest) {
  const tenant = request.nextUrl.searchParams.get("tenant")?.trim();
  if (!tenant) {
    return NextResponse.json({ error: "tenant is required" }, { status: 400 });
  }

  try {
    const result = await getIntegrationsWithCatalog(tenant);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to load integrations:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Integrations could not be loaded",
      },
      { status: 500 },
    );
  }
}
