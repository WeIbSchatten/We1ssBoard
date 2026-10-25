import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { Mark } from '@/components/logo';
import { DocsThemeSwitch } from '@/components/theme-switch';
import { appName, clientDocsUrl, productRepoUrl, siteUrl } from './shared';
import { getSiteMessages } from './site-i18n';

// Build locale-aware shared layout options. With `hideLocale: 'default-locale'`,
// English URLs have no prefix while other locales are prefixed (`/ru`).
export function baseOptions(lang: string): BaseLayoutProps {
  const prefix = lang === 'en' ? '' : `/${lang}`;
  const m = getSiteMessages(lang);

  return {
    slots: {
      themeSwitch: DocsThemeSwitch,
    },
    nav: {
      title: (
        <span className="inline-flex items-center gap-2 font-semibold">
          <Mark className="h-6" />
          {appName}
        </span>
      ),
      url: `${prefix}/`,
    },
    githubUrl: productRepoUrl,
    links: [
      {
        text: m.documentation,
        url: `${prefix}/docs`,
        active: 'nested-url',
      },
      // The clients' documentation; it links back here.
      {
        text: 'We1ssConnect',
        url: `${clientDocsUrl}${prefix}/docs`,
        external: true,
      },
      // Live component workbench built from frontend/ and published alongside the docs.
      {
        text: 'Storybook',
        url: `${siteUrl}/storybook/`,
        external: true,
      },
    ],
  };
}
