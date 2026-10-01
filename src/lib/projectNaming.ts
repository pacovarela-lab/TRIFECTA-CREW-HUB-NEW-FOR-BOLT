import type { ProjectType } from "@/lib/enums";

// Map enum -> human keyword used in project names
export const PROJECT_TYPE_KEYWORD: Record<ProjectType, string> = {
  bathroom_remodel: "Bathroom",
  kitchen_remodel: "Kitchen",
  painting: "Painting",
  drywall: "Drywall",
  flooring: "Flooring",
  roof: "Roof",
  landscaping: "Landscaping",
  junk_removal: "Junk Removal",
  general_handyman: "Handyman",
  other: "Project",
};

export const KEYWORD_OPTIONS = [
  "Bathroom", "Kitchen", "Painting", "Drywall", "Flooring",
  "Roof", "Landscaping", "Junk Removal", "Handyman", "Project",
];

const KEYWORD_HINTS: { keyword: string; patterns: RegExp[] }[] = [
  { keyword: "Bathroom",     patterns: [/bath/i, /shower/i, /vanity/i, /toilet/i] },
  { keyword: "Kitchen",      patterns: [/kitchen/i, /cabinet/i, /counter ?top/i, /backsplash/i] },
  { keyword: "Painting",     patterns: [/paint/i, /primer/i] },
  { keyword: "Drywall",      patterns: [/drywall/i, /sheetrock/i, /mud(ding)?/i] },
  { keyword: "Flooring",     patterns: [/floor/i, /tile/i, /vinyl/i, /hardwood/i, /laminate/i] },
  { keyword: "Roof",         patterns: [/roof/i, /shingle/i, /gutter/i] },
  { keyword: "Landscaping",  patterns: [/landscap/i, /lawn/i, /sod/i, /mulch/i, /garden/i] },
  { keyword: "Junk Removal", patterns: [/junk/i, /haul/i, /debris/i, /dumpster/i] },
  { keyword: "Handyman",     patterns: [/handyman/i, /repair/i, /fix/i] },
];

export const inferKeyword = (
  projectType: ProjectType | null | undefined,
  estimateDescriptions: string[] = [],
): string | null => {
  if (projectType && projectType !== "other") {
    return PROJECT_TYPE_KEYWORD[projectType];
  }
  const blob = estimateDescriptions.join(" ");
  if (!blob.trim()) return null;
  for (const { keyword, patterns } of KEYWORD_HINTS) {
    if (patterns.some((p) => p.test(blob))) return keyword;
  }
  return null;
};

/**
 * Build "<Client> <Keyword>" or "<Client> <Keyword> <N>" if the same client
 * already has 1+ projects (numbering is per-client across all keywords, so the
 * Nth project for the client is suffixed N).
 */
export const buildProjectName = (
  clientName: string,
  keyword: string,
  existingProjectsForClient: number,
): string => {
  const base = `${clientName.trim()} ${keyword.trim()}`.replace(/\s+/g, " ").trim();
  if (existingProjectsForClient <= 0) return base;
  return `${base} ${existingProjectsForClient + 1}`;
};
