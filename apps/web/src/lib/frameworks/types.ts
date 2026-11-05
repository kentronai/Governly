/**
 * Requirement catalog for a compliance framework tracked in Admin Center.
 *
 * Keys are hierarchical and stable — saved answers are stored against them:
 * section "1" → requirement "1.1" → subcontrol "1.1.1". Never renumber an
 * existing key; append new ones instead.
 *
 * Content is written by NORIX from the official public source of each
 * framework (see `source`); it must not be copied from third-party products.
 */
export interface FrameworkSubcontrol {
  key: string;
  title: string;
  description: string;
}

export interface FrameworkRequirement {
  key: string;
  title: string;
  description: string;
  /**
   * Empty for "flat" frameworks: the requirement itself is the control and
   * its Details (implementation, status, evidence…) are stored under its key.
   */
  subcontrols: FrameworkSubcontrol[];
  /** Shown indented under the previous requirement (e.g. a HIPAA implementation spec). */
  nested?: boolean;
  /** Optional assessment guidance shown above the Details form. */
  summary?: string;
  keyQuestions?: string[];
  evidenceExamples?: string[];
}

export interface FrameworkSection {
  key: string;
  title: string;
  requirements: FrameworkRequirement[];
}

export interface FrameworkDefinition {
  /** URL segment: /admin/settings/frameworks/<slug> */
  slug: string;
  /** Page title. */
  name: string;
  /** Sidebar label. */
  navLabel: string;
  /** `policy_center.name` values that enable this framework. */
  policyNames: string[];
  description: string;
  source: { title: string; url: string };
  sections: FrameworkSection[];
}
