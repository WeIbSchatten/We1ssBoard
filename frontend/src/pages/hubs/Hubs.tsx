import { useTranslation } from 'react-i18next';
import {
  ApartmentOutlined,
  ClusterOutlined,
  CodeOutlined,
  CloudServerOutlined,
  DatabaseOutlined,
  DiscordOutlined,
  ExportOutlined,
  GlobalOutlined,
  ImportOutlined,
  MailOutlined,
  MessageOutlined,
  SafetyOutlined,
  SendOutlined,
  SettingOutlined,
  SwapOutlined,
  TagsOutlined,
  TeamOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';

import { lazy } from 'react';

import { useSettingsSections } from '@/layouts/sectionModel';
import HubPage from './HubPage';

// Each tab's page stays its own chunk, loaded when the tab first opens.
const ClientsPage = lazy(() => import('@/pages/clients/ClientsPage'));
const GroupsPage = lazy(() => import('@/pages/groups/GroupsPage'));
const HostsPage = lazy(() => import('@/pages/hosts/HostsPage'));
const InboundsPage = lazy(() => import('@/pages/inbounds/InboundsPage'));
const NodesPage = lazy(() => import('@/pages/nodes/NodesPage'));
const SettingsPage = lazy(() => import('@/pages/settings/SettingsPage'));
const TgWebProxyPage = lazy(() => import('@/pages/tg-web-proxy/TgWebProxyPage'));
const XrayPage = lazy(() => import('@/pages/xray/XrayPage'));

export function ConnectionsHub() {
  const { t } = useTranslation();
  return (
    <HubPage
      path="/connections"
      className="connections-page"
      tabs={[
        {
          key: 'inbounds',
          icon: <ImportOutlined />,
          label: t('menu.inbounds'),
          render: () => <InboundsPage />,
        },
        {
          key: 'outbounds',
          icon: <ExportOutlined />,
          label: t('menu.outbounds'),
          render: () => <XrayPage forceSection="outbound" />,
        },
        {
          key: 'routing',
          icon: <SwapOutlined />,
          label: t('pages.xray.Routings'),
          render: () => <XrayPage forceSection="routing" />,
        },
        {
          key: 'balancers',
          icon: <ClusterOutlined />,
          label: t('pages.xray.Balancers'),
          render: () => <XrayPage forceSection="balancer" />,
        },
        {
          key: 'dns',
          icon: <DatabaseOutlined />,
          label: 'DNS',
          render: () => <XrayPage forceSection="dns" />,
        },
        {
          key: 'tg-web-proxy',
          icon: <SendOutlined />,
          label: t('menu.tgWebProxy'),
          render: () => <TgWebProxyPage />,
        },
      ]}
    />
  );
}

export function ClientsHub() {
  const { t } = useTranslation();
  return (
    <HubPage
      path="/clients"
      tabs={[
        {
          key: 'clients',
          icon: <TeamOutlined />,
          label: t('menu.clients'),
          render: () => <ClientsPage />,
        },
        {
          key: 'groups',
          icon: <TagsOutlined />,
          label: t('menu.groups'),
          render: () => <GroupsPage />,
        },
      ]}
    />
  );
}

export function NodesHub() {
  const { t } = useTranslation();
  return (
    <HubPage
      path="/nodes"
      tabs={[
        {
          key: 'nodes',
          icon: <ClusterOutlined />,
          label: t('menu.nodes'),
          render: () => <NodesPage />,
        },
        {
          key: 'hosts',
          icon: <GlobalOutlined />,
          label: t('menu.hosts'),
          render: () => <HostsPage />,
        },
      ]}
    />
  );
}

export function NotificationsHub() {
  const { t } = useTranslation();
  return (
    <HubPage
      path="/notifications"
      tabs={[
        {
          key: 'telegram',
          icon: <MessageOutlined />,
          label: t('pages.settings.TGBotSettings'),
          render: () => <SettingsPage section="telegram" />,
        },
        {
          key: 'discord',
          icon: <DiscordOutlined />,
          label: t('pages.settings.discordSettings'),
          render: () => <SettingsPage section="discord" />,
        },
        {
          key: 'email',
          icon: <MailOutlined />,
          label: t('pages.settings.emailSettings'),
          render: () => <SettingsPage section="email" />,
        },
      ]}
    />
  );
}

export function SettingsHub() {
  const { t } = useTranslation();
  const available = new Set(useSettingsSections().map((s) => s.key));
  const tabs = [
    {
      key: 'panel',
      icon: <SettingOutlined />,
      label: t('pages.settings.panelSettings'),
      render: () => <SettingsPage section="general" />,
    },
    {
      key: 'security',
      icon: <SafetyOutlined />,
      label: t('pages.settings.securitySettings'),
      render: () => <SettingsPage section="security" />,
    },
    {
      key: 'subscription',
      icon: <CloudServerOutlined />,
      label: t('pages.settings.subSettings'),
      render: () => <SettingsPage section="subscription" />,
    },
  ];
  if (available.has('subscription-formats')) {
    tabs.push({
      key: 'subscription-formats',
      icon: <CodeOutlined />,
      label: t('menu.subFormats'),
      render: () => <SettingsPage section="subscription-formats" />,
    });
  }
  if (available.has('subscription-balancers')) {
    tabs.push({
      key: 'subscription-balancers',
      icon: <ApartmentOutlined />,
      label: t('pages.settings.subBalancers.menu'),
      render: () => <SettingsPage section="subscription-balancers" />,
    });
  }
  tabs.push(
    {
      key: 'xray',
      icon: <ThunderboltOutlined />,
      label: t('menu.xrayCore'),
      render: () => <XrayPage forceSection="basic" />,
    },
    {
      key: 'xray-advanced',
      icon: <CodeOutlined />,
      label: t('menu.xrayJson'),
      render: () => <XrayPage forceSection="advanced" />,
    },
  );
  return <HubPage path="/settings" tabs={tabs} />;
}
