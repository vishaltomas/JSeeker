/** Editable profile fields — shared between the Settings profile editor
 * (ProfilesPanel.tsx) and the onboarding resume-review step, so the two
 * field lists can't drift out of sync. Deliberately excludes `resumePath`,
 * which is set directly by the file picker rather than typed/reviewed. */
export const FIELDS: { key: string; label: string }[] = [
  { key: "firstName", label: "First name" },
  { key: "lastName", label: "Last name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "address", label: "Street address" },
  { key: "city", label: "City" },
  { key: "state", label: "State / Province" },
  { key: "zip", label: "ZIP / Postal code" },
  { key: "country", label: "Country" },
  { key: "linkedin", label: "LinkedIn URL" },
  { key: "github", label: "GitHub URL" },
  { key: "website", label: "Website / Portfolio" },
  { key: "currentTitle", label: "Current title" },
  { key: "currentCompany", label: "Current company" },
];
