// src/app/admin/client-onboarding/page.tsx
import { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { db, users } from "@db";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { ClientOnboardingForm } from "@/components/admin/ClientOnboardingForm";

import { PageTitle } from "@/components/common/PageHeader";
export const metadata: Metadata = {
  title: "Create Organization | Kentron AI",
  description: "Create new organizations for AI governance platform",
};

export default async function ClientOnboardingPage() {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in?redirect_url=/admin/client-onboarding");
  }

  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { email: true },
  });
  const userEmail = user?.email?.trim().toLowerCase();

  if (!userEmail?.endsWith("@kentron.ai")) {
    redirect("/unauthorized?reason=kentron-only");
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4">
        <div className="text-center mb-8">
          <PageTitle>
            Create Organization
          </PageTitle>
          <p className="text-gray-600 mt-2">
            Create new organizations and send invitations to users
          </p>
        </div>

        <ClientOnboardingForm />

        <div className="mt-8 text-center">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 max-w-2xl mx-auto">
            <h3 className="text-lg font-semibold text-blue-900 mb-2">
              How it works
            </h3>
            <ul className="text-sm text-blue-800 space-y-1 text-left">
              <li>
                • Organization is created in Clerk with the specified name and
                slug
              </li>
              <li>• User is automatically invited as organization owner</li>
              <li>• Invitation email is sent to the user with signup link</li>
              <li>• User can accept invitation and start using the platform</li>
              <li>• All actions are logged for audit purposes</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
