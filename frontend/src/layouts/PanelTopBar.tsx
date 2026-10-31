import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import {
  KeyOutlined,
  LogoutOutlined,
  MenuOutlined,
  SafetyOutlined,
  SearchOutlined,
  UserOutlined,
} from '@ant-design/icons';

import { HttpUtil } from '@/utils';
import { useCommandPalette } from '@/components/command-palette/useCommandPalette';
import { useMobileNav } from '@/layouts/MobileNavContext';
import { routeForPath } from '@/layouts/navModel';
import { SHORTCUTS_EVENT } from '@/layouts/KeyboardShortcuts';
import './PanelTopBar.css';

const SHORTCUT_MODIFIER = /Mac|iPhone|iPad|iPod/.test(navigator.userAgent) ? '⌘' : 'Ctrl';

export default function PanelTopBar() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { open: openCommandPalette } = useCommandPalette();
  const { setOpen: setMobileNavOpen } = useMobileNav();

  const route = useMemo(() => routeForPath(pathname), [pathname]);

  const accountItems = useMemo<MenuProps['items']>(
    () => [
      { key: 'security', icon: <SafetyOutlined />, label: t('pages.settings.securitySettings') },
      { key: 'shortcuts', icon: <KeyOutlined />, label: t('shortcuts.title') },
      { type: 'divider' },
      { key: 'logout', icon: <LogoutOutlined />, label: t('logout'), danger: true },
    ],
    [t],
  );

  const onAccountClick: MenuProps['onClick'] = async ({ key }) => {
    if (key === 'security') {
      navigate('/settings#security');
      return;
    }
    if (key === 'shortcuts') {
      window.dispatchEvent(new Event(SHORTCUTS_EVENT));
      return;
    }
    await HttpUtil.post('/logout');
    window.location.href = window.X_UI_BASE_PATH || '/';
  };

  return (
    <header className="panel-topbar">
      <div className="panel-topbar-lead">
        <button
          type="button"
          className="panel-topbar-icon-btn panel-topbar-burger"
          aria-label={t('menu.openMenu')}
          onClick={() => setMobileNavOpen(true)}
        >
          <MenuOutlined />
        </button>
        <div className="panel-topbar-heading">
          <h1 className="panel-topbar-title">{t(route.titleKey)}</h1>
          <p className="panel-topbar-hint">{t(route.hintKey)}</p>
        </div>
      </div>

      <div className="panel-topbar-actions">
        <button
          type="button"
          className="panel-topbar-search"
          onClick={openCommandPalette}
          aria-label={t('commandPalette.title') || 'Command Palette (Ctrl + K)'}
        >
          <SearchOutlined className="panel-topbar-search-icon" />
          <span className="panel-topbar-search-text">{t('commandPalette.search') || 'Search'}</span>
          <span className="panel-topbar-search-kbd">
            <kbd>{SHORTCUT_MODIFIER}</kbd>
            <kbd>K</kbd>
          </span>
        </button>

        <Dropdown
          menu={{ items: accountItems, onClick: onAccountClick }}
          trigger={['click']}
          placement="bottomRight"
        >
          <button type="button" className="panel-topbar-icon-btn" aria-label={t('menu.account')}>
            <UserOutlined />
          </button>
        </Dropdown>
      </div>
    </header>
  );
}
