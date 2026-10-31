import { Outlet, useNavigate } from 'react-router';
import { ConfigProvider, Layout } from 'antd';

import { useWebSocketBridge } from '@/api/websocketBridge';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useTheme } from '@/hooks/useTheme';
import CommandPalette from '@/components/command-palette/CommandPalette';
import AppSidebar from '@/layouts/AppSidebar';
import PanelBackdrop from '@/layouts/PanelBackdrop';
import PanelTopBar from '@/layouts/PanelTopBar';
import KeyboardShortcuts from '@/layouts/KeyboardShortcuts';
import { NavLayoutProvider, useNavLayout } from '@/layouts/NavLayoutContext';
import { MobileNavProvider } from '@/layouts/MobileNavContext';
import './PanelChrome.css';

function PanelChrome() {
  const { navPosition } = useNavLayout();
  return (
    <Layout
      className={`panel-chrome panel-chrome--${navPosition}`}
      hasSider={navPosition === 'side'}
    >
      <PanelBackdrop />
      <AppSidebar />
      <Layout className="content-shell">
        <PanelTopBar />
        <main className="content-main">
          <Outlet />
        </main>
      </Layout>
    </Layout>
  );
}

export default function PanelLayout() {
  useWebSocketBridge();
  usePageTitle();
  const { antdThemeConfig } = useTheme();
  const navigate = useNavigate();
  return (
    <ConfigProvider theme={antdThemeConfig}>
      <NavLayoutProvider>
        <MobileNavProvider>
          <PanelChrome />
          <CommandPalette />
          <KeyboardShortcuts navigate={navigate} />
        </MobileNavProvider>
      </NavLayoutProvider>
    </ConfigProvider>
  );
}
