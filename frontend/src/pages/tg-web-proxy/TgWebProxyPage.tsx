import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Button, ConfigProvider, Layout, Modal, Result, Spin, message } from 'antd';
import PanelTabs from '@/layouts/PanelTabs';

import { useTheme } from '@/hooks/useTheme';
import { setMessageInstance } from '@/utils/messageBus';
import { useTgWebProxySnapshot, useTgWebProxyStatus } from '@/api/queries/useTgWebProxy';
import OverviewTab from './OverviewTab';
import ProfilesTab from './ProfilesTab';
import RelayUsersTab from './RelayUsersTab';
import ConfigTab from './ConfigTab';
import PublicSiteTab from './PublicSiteTab';
import LogsTab from './LogsTab';
import './TgWebProxyPage.css';

export default function TgWebProxyPage() {
  const { t } = useTranslation();
  const { isDark, isUltra, antdThemeConfig } = useTheme();
  const [modal, modalContextHolder] = Modal.useModal();
  const [messageApi, messageContextHolder] = message.useMessage();
  useEffect(() => {
    setMessageInstance(messageApi);
  }, [messageApi]);

  const snapshotQuery = useTgWebProxySnapshot();
  const statusQuery = useTgWebProxyStatus();
  const status = statusQuery.data;

  const pageClass = useMemo(() => {
    const classes = ['tg-web-proxy-page'];
    if (isDark) classes.push('is-dark');
    if (isUltra) classes.push('is-ultra');
    return classes.join(' ');
  }, [isDark, isUltra]);

  const loading = !status && !statusQuery.error;
  const fetchError = statusQuery.error ? (statusQuery.error as Error).message : '';

  return (
    <ConfigProvider theme={antdThemeConfig}>
      {messageContextHolder}
      {modalContextHolder}
      <Layout className={pageClass}>
        <Layout.Content id="content-layout" className="content-area">
          <Spin spinning={loading} delay={200} size="large">
            {loading ? (
              <div className="loading-spacer" />
            ) : fetchError || !status ? (
              <Result
                status="error"
                title={t('somethingWentWrong')}
                subTitle={fetchError}
                extra={
                  <Button type="primary" onClick={() => statusQuery.refetch()}>
                    {t('refresh')}
                  </Button>
                }
              />
            ) : (
              <>
                {!status.supported && (
                  <Alert
                    type="warning"
                    showIcon
                    style={{ marginBottom: 12 }}
                    title={t('pages.tgWebProxy.unsupported')}
                  />
                )}
                <PanelTabs
                  defaultActiveKey="overview"
                  items={[
                    {
                      key: 'overview',
                      label: t('pages.tgWebProxy.tabs.overview'),
                      children: <OverviewTab status={status} modal={modal} />,
                    },
                    {
                      key: 'users',
                      label: t('pages.tgWebProxy.tabs.users'),
                      children: <RelayUsersTab />,
                    },
                    {
                      key: 'profiles',
                      label: t('pages.tgWebProxy.tabs.profiles'),
                      children: (
                        <ProfilesTab
                          snapshot={snapshotQuery.data}
                          loading={snapshotQuery.isFetching}
                          modal={modal}
                        />
                      ),
                    },
                    {
                      key: 'config',
                      label: t('pages.tgWebProxy.tabs.config'),
                      children: snapshotQuery.data ? (
                        <ConfigTab
                          key={snapshotQuery.dataUpdatedAt}
                          snapshot={snapshotQuery.data}
                        />
                      ) : (
                        <Spin />
                      ),
                    },
                    {
                      key: 'publicSite',
                      label: t('pages.tgWebProxy.tabs.publicSite'),
                      children: <PublicSiteTab disabled={!status.supported} />,
                    },
                    {
                      key: 'logs',
                      label: t('pages.tgWebProxy.tabs.logs'),
                      children: <LogsTab disabled={!status.supported} />,
                    },
                  ]}
                />
              </>
            )}
          </Spin>
        </Layout.Content>
      </Layout>
    </ConfigProvider>
  );
}
