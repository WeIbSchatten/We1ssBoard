import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Button, Card, ConfigProvider, Layout, Spin, message } from 'antd';
import { LogoutOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { LanguageManager } from '@/utils';
import { setMessageInstance } from '@/utils/messageBus';
import { useTheme } from '@/hooks/useTheme';
import SubHeader from '@/pages/sub/SubHeader';
import '@/pages/sub/SubPage.css';
import PortalChangePassword from './PortalChangePassword';
import PortalLogin from './PortalLogin';
import PortalProfileView from './PortalProfile';
import { PortalApiError, portalApi } from './portalApi';
import { portalErrorText } from './portalErrors';
import './PortalPage.css';

export const PORTAL_ME_KEY = ['portal', 'me'] as const;
const RTL_LANGUAGES = new Set(['fa-IR', 'ar-EG']);

export default function PortalPage() {
  const { t } = useTranslation();
  const { isDark, isUltra, antdThemeConfig } = useTheme();
  const queryClient = useQueryClient();
  const [messageApi, messageContextHolder] = message.useMessage();
  useEffect(() => setMessageInstance(messageApi), [messageApi]);
  const [lang, setLang] = useState<string>(() => LanguageManager.getLanguage('subscription'));
  const onLangChange = useCallback((next: string) => {
    setLang(next);
    LanguageManager.setLanguage(next, 'subscription');
  }, []);

  const me = useQuery({ queryKey: PORTAL_ME_KEY, queryFn: portalApi.me, retry: false });
  const reload = useCallback(
    () => queryClient.resetQueries({ queryKey: PORTAL_ME_KEY }),
    [queryClient],
  );
  const logout = async () => {
    await portalApi.logout().catch(() => undefined);
    await reload();
  };

  const code = me.error instanceof PortalApiError ? me.error.code : '';
  let body;
  if (me.isLoading) body = <Spin className="portal-spin" />;
  else if (code === 'unauthorized') body = <PortalLogin onLoggedIn={reload} />;
  else if (code === 'must_change_password')
    body = <PortalChangePassword temporary onDone={reload} onUnauthorized={reload} />;
  else if (me.error) body = <Alert type="error" showIcon title={portalErrorText(t, me.error)} />;
  else if (me.data)
    body = (
      <PortalProfileView profile={me.data} onChanged={() => me.refetch()} onUnauthorized={reload} />
    );

  const direction = RTL_LANGUAGES.has(lang) ? 'rtl' : 'ltr';
  const pageClass = ['subscription-page', 'portal-page', isDark && 'is-dark', isUltra && 'is-ultra']
    .filter(Boolean)
    .join(' ');

  return (
    <ConfigProvider theme={antdThemeConfig} direction={direction}>
      {messageContextHolder}
      <Layout className={pageClass} dir={direction}>
        <Layout.Content className="sub-content">
          <Card className="sub-card">
            <SubHeader
              title={window.__PORTAL__?.subTitle || t('portal.title')}
              sId=""
              email={me.data?.email ?? ''}
              lang={lang}
              onLangChange={onLangChange}
              actions={
                me.data && (
                  <Button className="toolbar-btn" icon={<LogoutOutlined />} onClick={logout}>
                    {t('portal.logout')}
                  </Button>
                )
              }
            />
            {body}
          </Card>
        </Layout.Content>
      </Layout>
    </ConfigProvider>
  );
}
