"use client";
import React from "react";
import ApplicationStatus from "@/components/application-scope/status";
import { ApplicationScopeForm } from "@/components/application-scope/form";

import { PageTitle } from "@/components/common/PageHeader";
const ApplicationScope: React.FC = () => {
  return (
    <>
      <div className="mb-8 flex justify-between items-center">
        <PageTitle className="my-2">
          Application Scope
        </PageTitle>
        {/* <ApplicationStatus></ApplicationStatus> */}
      </div>
      <ApplicationScopeForm></ApplicationScopeForm>
    </>
  );
};

export default ApplicationScope;
