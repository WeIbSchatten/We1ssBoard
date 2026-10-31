import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Button, Card, Space, Table, Tag, Typography } from 'antd';
import { DisconnectOutlined, EyeInvisibleOutlined, EyeOutlined } from '@ant-design/icons';

import type { TgWebProxyBinding } from '@/generated/types';
import { useTgWebProxyBindingMutations, useTgWebProxyBindings } from '@/api/queries/useTgWebProxy';
import type { ModalApi } from './types';

function maskSecret(secret: string): string {
  return secret.length > 8 ? `${secret.slice(0, 4)}…${secret.slice(-4)}` : '••••';
}

// nodeId narrows the table to one relay (0 = this panel); omitted, it lists every binding.
export default function ClientBindingsCard({
  modal,
  nodeId,
}: {
  modal: ModalApi;
  nodeId?: number;
}) {
  const { t } = useTranslation();
  const { data, isLoading } = useTgWebProxyBindings();
  const { unbindClient, pending } = useTgWebProxyBindingMutations();
  const [reveal, setReveal] = useState<Record<number, boolean>>({});

  const onUnbind = (b: TgWebProxyBinding) =>
    modal.confirm({
      title: t('pages.tgWebProxy.bindings.unbindConfirm', { email: b.email }),
      okText: t('pages.tgWebProxy.bindings.unbind'),
      okType: 'danger',
      cancelText: t('cancel'),
      onOk: async () => {
        await unbindClient(b.email);
      },
    });

  const columns = [
    { title: t('pages.tgWebProxy.bindings.client'), dataIndex: 'email', key: 'email' },
    {
      title: t('pages.tgWebProxy.bindings.profile'),
      dataIndex: 'profileName',
      key: 'profileName',
      render: (name: string) => <Typography.Text code>{name}</Typography.Text>,
    },
    {
      title: t('pages.tgWebProxy.bindings.dedicated'),
      dataIndex: 'dedicated',
      key: 'dedicated',
      render: (dedicated: boolean) =>
        dedicated ? (
          <Tag color="green">{t('pages.tgWebProxy.yes')}</Tag>
        ) : (
          <Tag>{t('pages.tgWebProxy.no')}</Tag>
        ),
    },
    {
      title: t('pages.tgWebProxy.bindings.effective'),
      dataIndex: 'effectiveProfile',
      key: 'effectiveProfile',
      render: (name: string) => <Typography.Text code>{name}</Typography.Text>,
    },
    {
      title: t('pages.tgWebProxy.bindings.secret'),
      key: 'secret',
      render: (_: unknown, b: TgWebProxyBinding) => {
        if (!b.secret) return '—';
        const shown = !!reveal[b.clientId];
        return (
          <Space size={4}>
            <Typography.Text code copyable={shown ? { text: b.secret } : false}>
              {shown ? b.secret : maskSecret(b.secret)}
            </Typography.Text>
            <Button
              type="text"
              size="small"
              icon={shown ? <EyeInvisibleOutlined /> : <EyeOutlined />}
              aria-label={
                shown
                  ? t('pages.tgWebProxy.bindings.hideSecret')
                  : t('pages.tgWebProxy.bindings.showSecret')
              }
              onClick={() => setReveal((prev) => ({ ...prev, [b.clientId]: !shown }))}
            />
          </Space>
        );
      },
    },
    {
      title: t('pages.tgWebProxy.bindings.link'),
      key: 'link',
      render: (_: unknown, b: TgWebProxyBinding) =>
        b.link ? (
          <Typography.Text copyable={{ text: b.link }} ellipsis style={{ maxWidth: 220 }}>
            {b.link}
          </Typography.Text>
        ) : (
          '—'
        ),
    },
    {
      title: '',
      key: 'actions',
      render: (_: unknown, b: TgWebProxyBinding) => (
        <Button
          size="small"
          danger
          icon={<DisconnectOutlined />}
          loading={pending}
          onClick={() => onUnbind(b)}
        >
          {t('pages.tgWebProxy.bindings.unbind')}
        </Button>
      ),
    },
  ];

  return (
    <Card size="small" style={{ marginTop: 16 }} title={t('pages.tgWebProxy.bindings.title')}>
      <Typography.Paragraph type="secondary">
        {t('pages.tgWebProxy.bindings.hint')}
      </Typography.Paragraph>
      {data?.syncError && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 12 }}
          title={t('pages.tgWebProxy.bindings.syncError', { error: data.syncError })}
        />
      )}
      <Table
        rowKey="clientId"
        size="small"
        loading={isLoading}
        dataSource={(data?.bindings ?? []).filter(
          (b) => nodeId == null || (b.nodeId ?? 0) === nodeId,
        )}
        columns={columns}
        pagination={false}
        scroll={{ x: true }}
        locale={{ emptyText: t('pages.tgWebProxy.bindings.empty') }}
      />
    </Card>
  );
}
