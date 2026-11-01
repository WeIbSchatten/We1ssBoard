import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate, useLocation, type RouteObject } from 'react-router';
import { Spin } from 'antd';

import PanelLayout from '@/layouts/PanelLayout';
import { legacyTarget } from '@/layouts/navModel';

const IndexPage = lazy(() => import('@/pages/index/IndexPage'));
const hub = (
  name: 'ConnectionsHub' | 'ClientsHub' | 'NodesHub' | 'NotificationsHub' | 'SettingsHub',
) => lazy(() => import('@/pages/hubs/Hubs').then((m) => ({ default: m[name] })));
const ConnectionsHub = hub('ConnectionsHub');
const ClientsHub = hub('ClientsHub');
const NodesHub = hub('NodesHub');
const NotificationsHub = hub('NotificationsHub');
const SettingsHub = hub('SettingsHub');
const ApiDocsPage = lazy(() => import('@/pages/api-docs/ApiDocsPage'));

function withSuspense(node: React.ReactNode) {
  return (
    <Suspense
      fallback={
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            minHeight: 'calc(60vh / var(--fb-zoom, 1))',
          }}
        >
          <Spin size="large" />
        </div>
      }
    >
      {node}
    </Suspense>
  );
}

// Pages that became tabs of a hub keep working as bookmarks.
function LegacyRedirect() {
  const { pathname, hash, search } = useLocation();
  return <Navigate to={(legacyTarget(pathname, hash) ?? '/') + search} replace />;
}

const routes: RouteObject[] = [
  {
    path: '/',
    element: <PanelLayout />,
    children: [
      { index: true, element: withSuspense(<IndexPage />) },
      { path: 'clients', element: withSuspense(<ClientsHub />) },
      { path: 'connections', element: withSuspense(<ConnectionsHub />) },
      { path: 'nodes', element: withSuspense(<NodesHub />) },
      { path: 'notifications', element: withSuspense(<NotificationsHub />) },
      { path: 'settings', element: withSuspense(<SettingsHub />) },
      ...[
        'inbounds',
        'outbound',
        'tg-web-proxy',
        'routing',
        'groups',
        'hosts',
        'xray',
        'subscriptions',
      ].map((path) => ({
        path,
        element: <LegacyRedirect />,
      })),
      { path: 'api-docs', element: withSuspense(<ApiDocsPage />) },
    ],
  },
];

function computeBasename() {
  const raw = (typeof window !== 'undefined' && window.X_UI_BASE_PATH) || '/';
  const trimmed = raw.replace(/\/+$/, '');
  return `${trimmed}/panel`;
}

export const router = createBrowserRouter(routes, {
  basename: computeBasename(),
});
