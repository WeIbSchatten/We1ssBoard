export const appName = 'We1ssBoard';
export const appTagline = 'Advanced web panel for managing Xray-core servers';

export const docsRoute = '/docs';
export const docsImageRoute = '/og/docs';
export const docsContentRoute = '/llms.mdx/docs';

// The We1ssBoard product repository — used for the navbar GitHub link,
// build-time star/release stats, and install commands.
export const productRepo = {
  user: 'WeIbSchatten',
  repo: 'We1ssBoard',
  branch: 'main',
};

// Where these docs live in the We1ssBoard monorepo — used for "Edit on GitHub" links.
export const gitConfig = {
  user: 'WeIbSchatten',
  repo: 'We1ssBoard',
  branch: 'main',
  docsDir: 'docs/content/docs',
};

export const productRepoUrl = `https://github.com/${productRepo.user}/${productRepo.repo}`;

// Documentation of the We1ssConnect clients (Android, desktop, OpenWrt).
export const clientDocsUrl = 'https://weibschatten.github.io/We1ssConnect';

// AI-generated interactive wiki of the We1ssBoard codebase.
export const deepWikiUrl = `https://deepwiki.com/${productRepo.user}/${productRepo.repo}`;

// Public site origin, used for metadataBase / canonical URLs / OG images.
// Defaults to the GitHub Pages URL, so the env var is optional. Use `||` (not
// `??`) so an empty string — e.g. an unset `${{ vars.NEXT_PUBLIC_SITE_URL }}`
// in CI — also falls back instead of shipping a blank origin.
export const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL || 'https://weibschatten.github.io/We1ssBoard';

// Path prefix of the static export (e.g. "/We1ssBoard"), set in next.config.mjs.
export const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

// Prefixes a root-relative path to a public file or route that does not go through next/link.
export function withBasePath(path: string): string {
  return `${basePath}${path}`;
}
