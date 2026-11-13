import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Button, Descriptions, Popconfirm, Space, Spin, Tag, Typography } from 'antd';
import { CopyOutlined } from '@ant-design/icons';

import { useClientPortalAccess, useClientPortalMutations } from '@/api/queries/useClientPortal';
import type { ClientPortalPassword } from '@/generated/types';
import { ClipboardManager } from '@/utils';
import { getMessage } from '@/utils/messageBus';

const STATUS_COLOR: Record<string, string> = {
  none: 'default',
  temporary: 'orange',
  own: 'green',
  ldap: 'blue',
};

const DESCRIPTION_STYLES = { label: { width: 180 } };
const CONFIRM_STYLES = { root: { maxWidth: 340 } };

function Manage({ email }: { email: string }) {
  const { t } = useTranslation();
  const access = useClientPortalAccess(email);
  const { issuePassword, revokeAccess, pending } = useClientPortalMutations(email);
  const [issued, setIssued] = useState<ClientPortalPassword>();

  if (access.isLoading) return <Spin />;
  if (access.isError || !access.data) {
    return <Alert type="error" showIcon title={(access.error as Error | null)?.message ?? ''} />;
  }
  if (!access.data.portalEnabled) {
    return <Alert type="info" showIcon title={t('pages.clients.portal.disabled')} />;
  }
  const { status, hiddenKeys, devices, portalUrl } = access.data;
  const copyForClient = async (password: string) => {
    const text = t('pages.clients.portal.credentials', { url: portalUrl, login: email, password });
    if (await ClipboardManager.copyText(text)) getMessage().success(t('copied'));
  };

  return (
    <Space orientation="vertical" style={{ width: '100%' }}>
      <Typography.Text type="secondary">{t('pages.clients.portal.appliesNow')}</Typography.Text>
      <Descriptions size="small" column={1} bordered styles={DESCRIPTION_STYLES}>
        <Descriptions.Item label={t('pages.clients.portal.portalUrl')}>
          <Typography.Link href={portalUrl} target="_blank" rel="noreferrer" copyable>
            {portalUrl}
          </Typography.Link>
        </Descriptions.Item>
        <Descriptions.Item label={t('pages.clients.portal.statusLabel')}>
          <Tag color={STATUS_COLOR[status] ?? 'default'}>
            {t(`pages.clients.portal.status.${status}`)}
          </Tag>
        </Descriptions.Item>
        <Descriptions.Item label={t('pages.clients.portal.hiddenKeys')}>
          {hiddenKeys}
        </Descriptions.Item>
        <Descriptions.Item label={t('pages.clients.portal.devices')}>{devices}</Descriptions.Item>
      </Descriptions>
      {issued && (
        <Alert
          type="success"
          showIcon
          title={t('pages.clients.portal.passwordIssued')}
          description={
            <Space orientation="vertical">
              <Descriptions size="small" column={1} colon={false} styles={DESCRIPTION_STYLES}>
                <Descriptions.Item label={t('pages.clients.portal.loginLabel')}>
                  <Typography.Text copyable>{email}</Typography.Text>
                </Descriptions.Item>
                <Descriptions.Item label={t('pages.clients.portal.passwordLabel')}>
                  <Typography.Text code copyable strong className="client-portal-password">
                    {issued.password}
                  </Typography.Text>
                </Descriptions.Item>
              </Descriptions>
              <Button icon={<CopyOutlined />} onClick={() => copyForClient(issued.password)}>
                {t('pages.clients.portal.copyForClient')}
              </Button>
              <Typography.Text type="secondary">
                {t('pages.clients.portal.passwordOnce')}
              </Typography.Text>
              {issued.sentToTelegram && (
                <Typography.Text>{t('pages.clients.portal.sentToTelegram')}</Typography.Text>
              )}
            </Space>
          }
        />
      )}
      <Space wrap>
        <Popconfirm
          placement="topLeft"
          styles={CONFIRM_STYLES}
          okText={t('confirm')}
          cancelText={t('cancel')}
          title={t('pages.clients.portal.issueConfirm')}
          onConfirm={async () => setIssued(await issuePassword())}
        >
          <Button type="primary" loading={pending}>
            {t('pages.clients.portal.issuePassword')}
          </Button>
        </Popconfirm>
        <Popconfirm
          placement="topLeft"
          styles={CONFIRM_STYLES}
          okText={t('confirm')}
          cancelText={t('cancel')}
          title={t('pages.clients.portal.revokeConfirm')}
          onConfirm={async () => {
            setIssued(undefined);
            await revokeAccess();
          }}
        >
          <Button danger disabled={pending || status === 'none'}>
            {t('pages.clients.portal.revoke')}
          </Button>
        </Popconfirm>
      </Space>
    </Space>
  );
}

export default function ClientPortalSection({ email }: { email?: string }) {
  const { t } = useTranslation();
  if (!email) return <Alert type="info" showIcon title={t('pages.clients.portal.saveFirst')} />;
  return <Manage email={email} />;
}
