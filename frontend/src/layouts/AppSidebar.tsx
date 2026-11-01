import { useCallback, useMemo, useState } from 'react';
import type { ComponentType } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { docsUrl } from './docsUrl';
import { Drawer, Layout, Menu, Tooltip } from 'antd';
import type { MenuProps } from 'antd';
import {
  ApiOutlined,
  BellOutlined,
  CloseOutlined,
  ClusterOutlined,
  GithubOutlined,
  LayoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  NodeIndexOutlined,
  ReadOutlined,
  SettingOutlined,
  TeamOutlined,
} from '@ant-design/icons';

import { formatPanelVersion } from '@/lib/panel-version';
import { isNavKeyVisible, parseNavVisibility } from '@/lib/navVisibility';
import { parseCssBundle } from '@/pages/settings/CustomCssSettings';
import { useAllSettings } from '@/api/queries/useAllSettings';
import { useNavLayout } from '@/layouts/NavLayoutContext';
import { useMobileNav } from '@/layouts/MobileNavContext';
import { NAV_ROUTES, NAV_SECTION_TITLE_KEYS, type NavSection } from '@/layouts/navModel';
import BrandMark from '@/components/ui/BrandMark';
import ThemeSwitch from '@/components/ui/ThemeSwitch';
import { AppearanceButton } from '@/components/ui/AppearancePanel';
import './AppSidebar.css';

const REPO_URL = 'https://github.com/WeIbSchatten/We1ssBoard';
const SIDER_WIDTH = 248;
const RAIL_WIDTH = 72;
const SIDEBAR_COLLAPSED_KEY = 'sidebar-collapsed';

const ICONS: Record<string, ComponentType> = {
  '/': LayoutOutlined,
  '/clients': TeamOutlined,
  '/connections': NodeIndexOutlined,
  '/nodes': ClusterOutlined,
  '/notifications': BellOutlined,
  '/settings': SettingOutlined,
  '/api-docs': ApiOutlined,
};

function readCollapsed() {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
  } catch {
    return false;
  }
}

function saveCollapsed(collapsed: boolean) {
  try {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed));
  } catch {
    /* storage unavailable: the choice just won't persist */
  }
}

export default function AppSidebar() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { allSetting } = useAllSettings();
  const { navPosition } = useNavLayout();
  const { open: drawerOpen, setOpen: setDrawerOpen } = useMobileNav();
  const topNav = navPosition === 'top';
  const navVisibility = useMemo(
    () => parseNavVisibility(parseCssBundle(allSetting.customCssBundle).navVisibility),
    [allSetting.customCssBundle],
  );

  const [collapsed, setCollapsed] = useState(readCollapsed);
  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      saveCollapsed(!prev);
      return !prev;
    });
  }, []);

  const panelVersion = formatPanelVersion(window.X_UI_CUR_VER || '');

  const visibleRoutes = useMemo(
    () => NAV_ROUTES.filter((r) => isNavKeyVisible(r.key, navVisibility)),
    [navVisibility],
  );

  const routeItem = useCallback(
    (key: string, title: string): NonNullable<MenuProps['items']>[number] => {
      const Icon = ICONS[key] ?? LayoutOutlined;
      return { key, icon: <Icon />, label: title };
    },
    [],
  );

  // Sections render as labelled groups in the full sidebar and the drawer.
  const groupedItems = useMemo<MenuProps['items']>(() => {
    const out: NonNullable<MenuProps['items']> = [];
    const sections: NavSection[] = ['main', 'users', 'traffic', 'infra', 'system'];
    for (const section of sections) {
      const routes = visibleRoutes.filter((r) => r.section === section);
      if (routes.length === 0) continue;
      const children = routes.map((r) => routeItem(r.key, t(r.titleKey)));
      if (section === 'main') {
        out.push(...children);
      } else {
        out.push({
          type: 'group',
          key: `group-${section}`,
          label: t(NAV_SECTION_TITLE_KEYS[section]),
          children,
        });
      }
    }
    return out;
  }, [visibleRoutes, routeItem, t]);

  const flatItems = useMemo<MenuProps['items']>(
    () => visibleRoutes.map((r) => routeItem(r.key, t(r.titleKey))),
    [visibleRoutes, routeItem, t],
  );

  const selectedKey = pathname || '/';

  const onMenuClick = useCallback<NonNullable<MenuProps['onClick']>>(
    ({ key }) => {
      navigate(String(key));
      setDrawerOpen(false);
    },
    [navigate, setDrawerOpen],
  );

  const footerLinks = (compact: boolean) => (
    <div className={`sider-links${compact ? ' sider-links--compact' : ''}`}>
      <Tooltip title={compact ? t('menu.docs') : undefined} placement="right">
        <a
          href={docsUrl(i18n.language)}
          target="_blank"
          rel="noopener noreferrer"
          className="sider-link"
        >
          <ReadOutlined />
          {!compact && <span>{t('menu.docs')}</span>}
        </a>
      </Tooltip>
      <Tooltip title={compact ? `GitHub ${panelVersion}` : undefined} placement="right">
        <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="sider-link">
          <GithubOutlined />
          {!compact && (
            <span>
              GitHub <span className="sider-version">{panelVersion}</span>
            </span>
          )}
        </a>
      </Tooltip>
    </div>
  );

  const brand = (compact: boolean) => (
    <div className="sider-brand">
      <BrandMark size={32} />
      {!compact && (
        <div className="sider-brand-text">
          <span className="sider-brand-name">We1ssBoard</span>
          <span className="sider-brand-sub">Xray panel</span>
        </div>
      )}
    </div>
  );

  const drawer = (
    <Drawer
      placement="left"
      closable={false}
      open={drawerOpen}
      size={300}
      rootClassName="sider-drawer"
      styles={{
        body: { padding: 0, display: 'flex', flexDirection: 'column', height: '100%' },
        header: { display: 'none' },
      }}
      onClose={() => setDrawerOpen(false)}
    >
      <div className="sider-drawer-head">
        {brand(false)}
        <button
          className="sider-icon-btn"
          type="button"
          aria-label={t('close')}
          onClick={() => setDrawerOpen(false)}
        >
          <CloseOutlined />
        </button>
      </div>
      <Menu
        mode="inline"
        selectedKeys={[selectedKey]}
        className="sider-nav"
        items={groupedItems}
        onClick={onMenuClick}
      />
      <div className="sider-footer">
        <div className="appearance-row">
          <ThemeSwitch />
          <AppearanceButton placement="top" />
        </div>
        {footerLinks(false)}
      </div>
    </Drawer>
  );

  if (topNav) {
    return (
      <div className="ant-sidebar ant-sidebar--top">
        <Layout.Header className="top-nav-header">
          {brand(false)}
          <div className="top-nav-menu-wrap">
            <Menu
              mode="horizontal"
              selectedKeys={[selectedKey]}
              className="top-nav-menu"
              triggerSubMenuAction="click"
              items={flatItems}
              onClick={onMenuClick}
            />
          </div>
          <div className="top-nav-tools">
            <ThemeSwitch compact />
            <AppearanceButton placement="bottomRight" />
          </div>
        </Layout.Header>
        {drawer}
      </div>
    );
  }

  return (
    <div className={`ant-sidebar${collapsed ? ' ant-sidebar--collapsed' : ''}`}>
      <Layout.Sider
        width={SIDER_WIDTH}
        collapsedWidth={RAIL_WIDTH}
        collapsed={collapsed}
        trigger={null}
      >
        <div className="sider-inner">
          {brand(collapsed)}
          <Menu
            mode="inline"
            inlineCollapsed={collapsed}
            selectedKeys={[selectedKey]}
            className="sider-nav"
            items={collapsed ? flatItems : groupedItems}
            onClick={onMenuClick}
          />
          <div className="sider-footer">
            <div className={`appearance-row${collapsed ? ' appearance-row--compact' : ''}`}>
              <ThemeSwitch compact={collapsed} />
              <AppearanceButton />
            </div>
            {footerLinks(collapsed)}
            <button
              type="button"
              className="sider-collapse"
              onClick={toggleCollapsed}
              aria-label={t(collapsed ? 'menu.expandSidebar' : 'menu.collapseSidebar')}
              aria-pressed={collapsed}
              title={t(collapsed ? 'menu.expandSidebar' : 'menu.collapseSidebar')}
            >
              {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              {!collapsed && <span>{t('menu.collapseSidebar')}</span>}
            </button>
          </div>
        </div>
      </Layout.Sider>
      {drawer}
    </div>
  );
}
