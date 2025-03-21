export const E2E_ROOT_URL = "http://localhost:5000";
export const OUTPUT_DIR = "screenshots";

export const INVITE_LINKS_BY_ROLE = {
  viewer: "http://localhost:5000/join/UIMF75kdsl1HQH3P/en",
  community_checker: "http://localhost:5000/join/SlW-SIhqR03frd9y/en",
  commenter: "http://localhost:5000/join/hJhE8YEzD8XPiPqX/en"
};

const allApplicationScopes = ["home_and_login", "main_application"] as const;
type ApplicationScope = (typeof allApplicationScopes)[number];
const allBrowsers = ["chromium", "firefox", "webkit"] as const;
type Browser = (typeof allBrowsers)[number];
const allRoles = [
  "pt_administrator",
  "pt_translator",
  "pt_consultant",
  "pt_observer",
  "community_checker",
  "commenter",
  "viewer"
] as const;
export type Role = (typeof allRoles)[number];

type RunSheet = {
  locales: string[];
  roles: Role[];
  applicationScopes: ApplicationScope[];
  browsers: Browser[];
  skipScreenshots: boolean;
  screenshotPrefix: string;
};

export type ScreenshotContext = {
  prefix: string;
  engine: Browser;
  role?: Role;
  pageName?: string;
  locale?: string;
};

export const runSheet: RunSheet = {
  locales: ["en"],
  roles: allRoles.slice(),
  applicationScopes: ["main_application"],
  browsers: ["chromium"],
  skipScreenshots: false,
  screenshotPrefix: new Date().toISOString().slice(0, 19)
} as const;

export const DEFAULT_PROJECT_SHORTNAME = "Stp22";
