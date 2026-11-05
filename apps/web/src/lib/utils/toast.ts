import { showSuccessToast, showErrorToast } from "@/components/ui/custom-toast";

// Get appropriate icon based on action
export const getActionIcon = (action: string): string => {
  switch (action) {
    case "created":
      return "🎉";
    case "deleted":
      return "🗑️";
    case "updated":
    case "modified":
      return "✏️";
    case "archived":
      return "📦";
    case "granted":
      return "✅";
    case "revoked":
      return "🚫";
    case "connection_created":
      return "🔗";
    case "connection_deleted":
      return "❌";
    default:
      return "✅";
  }
};

export const successToast = (
  response: any,
  operation: string,
  action: string,
  manualMessage?: string,
) => {
  let message = "";

  if (response?.message) {
    message = response?.message;
  } else if (response?.data?.message) {
    message = response?.data?.message;
  } else if (typeof manualMessage === "string") {
    message = manualMessage;
  } else {
    message = operation + " " + action + " successfully";
  }

  const icon = getActionIcon(action);

  // Use our custom toast component
  showSuccessToast(message, icon);
};

// A one-time informational toast (ℹ️). Used for benign notices that should be
// shown once at the moment of an action rather than persisted as a standing
// banner — e.g. an optional discovery capability that was skipped.
export const infoToast = (message: string) => {
  showSuccessToast(message, "ℹ️");
};

export const errorToast = (error: any) => {
  let errorMessage = "";

  if (error?.response?.data?.errors?.non_field_errors?.length > 0) {
    errorMessage = error?.response?.data?.errors?.non_field_errors
      ?.map((error: any) => error)
      .join(", ");
  } else if (error?.response?.data?.data?.non_field_errors?.length > 0) {
    errorMessage = error?.response?.data?.data?.non_field_errors?.join(", ");
  } else if (
    error?.response?.data?.errors &&
    Object.keys(error?.response?.data?.errors).length > 0
  ) {
    const errors = error?.response?.data?.errors || {};
    errorMessage = Object.entries(errors)
      .map(([key, value]: any) => `${key}: ${value.join(", ")}`)
      .join(", ");
  } else if (
    error?.response?.data?.data &&
    Object.keys(error?.response?.data?.data).length > 0
  ) {
    const errors = error?.response?.data?.data || {};
    errorMessage = Object.entries(errors)
      .map(([key, value]: any) => `${key}: ${value.join(", ")}`)
      .join(", ");
  } else if (error?.response?.data?.message) {
    errorMessage = error?.response?.data?.message;
  } else if (error?.response?.data?.detail) {
    errorMessage = error?.response?.data?.detail;
  } else if (error?.message) {
    errorMessage = error.message;
  } else if (typeof error === "string") {
    errorMessage = error;
  } else {
    errorMessage = "Something went wrong";
  }

  // Use our custom toast component
  showErrorToast(errorMessage);
};
