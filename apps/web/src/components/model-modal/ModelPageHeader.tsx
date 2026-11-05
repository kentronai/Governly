import React from "react";

import { PageTitle } from "@/components/common/PageHeader";
interface WorkspacePageHeaderProps {
  userProfile?: {
    username?: string;
    name?: string;
  };
  text: string;
}

const WorkspacePageHeader: React.FC<WorkspacePageHeaderProps> = ({
  userProfile,
  text,
}) => {
  const displayName = userProfile?.username || userProfile?.name;

  if (!displayName) return null;

  return (
    <div className="gap-3 mb-[14px]">
      <PageTitle className="mt-[20px]">Hello, {displayName}!</PageTitle>
      <p className="text-muted-foreground font-normal leading-5 font-sf-pro mt-1 text-[#71717A] text-[14px]">
        {text}
      </p>
    </div>
  );
};

export default WorkspacePageHeader;
