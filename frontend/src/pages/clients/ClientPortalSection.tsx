import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Button, Descriptions, Popconfirm, Space, Spin, Tag, Typography } from 'antd';

import { useClientPortalAccess, useClientPortalMutations } from '@/api/queries/useClientPortal';
import type { ClientPortalPassword } from '@/generated/types';

const STATUS_COLOR: Record<string, string> = {
  none: 'default',
  temporary: 'orange',
  own: 'green',
  ldap: 'blue',
};

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
  const { status, hiddenKeys, devices } = access.data;

  return (
    <Space orientation="vertical" style={{ width: '100%' }}>
      <Descriptions size="small" column={1} bordered>
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
              <Typography.Text code copyable>
                {issued.password}
              </Typography.Text>
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
          title={t('pages.clients.portal.issueConfirm')}
          onConfirm={async () => setIssued(await issuePassword())}
        >
          <Button type="primary" loading={pending}>
            {t('pages.clients.portal.issuePassword')}
          </Button>
        </Popconfirm>
        <Popconfirm
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
