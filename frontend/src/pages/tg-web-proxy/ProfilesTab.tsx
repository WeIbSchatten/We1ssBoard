import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Button, Card, Space, Table, Tag, Tooltip, Typography } from 'antd';
import {
  DeleteOutlined,
  EditOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
  NodeIndexOutlined,
  PlusOutlined,
  ShareAltOutlined,
  UserAddOutlined,
} from '@ant-design/icons';

import type {
  RelayApplyResult,
  RelayProfile,
  RelayShareInfo,
  RelaySnapshot,
} from '@/generated/types';
import { fetchShare, useTgWebProxyMutations } from '@/api/queries/useTgWebProxy';
import type { Msg } from '@/utils';
import { getMessage } from '@/utils/messageBus';
import { isManagedProfile } from '@/lib/tgWebProxy';
import BindClientsModal from './BindClientsModal';
import ProfileEgressCheck from './ProfileEgressCheck';
import ProfileFormModal from './ProfileFormModal';
import RouteViaOutboundModal from './RouteViaOutboundModal';
import ShareModal from './ShareModal';
import type { ModalApi } from './types';

function maskSecret(secret: string): string {
  return secret.length > 8 ? `${secret.slice(0, 4)}…${secret.slice(-4)}` : '••••';
}

export function reportApply(
  msg: Msg<RelayApplyResult> | undefined,
  t: (key: string, opts?: Record<string, unknown>) => string,
) {
  const res = msg?.obj;
  if (!msg?.success || !res) return;
  if (res.restartError) {
    getMessage().warning(t('pages.tgWebProxy.toasts.restartFailed', { error: res.restartError }));
  } else if (res.restarted) {
    getMessage().info(t('pages.tgWebProxy.toasts.restarted'));
  }
  if (res.caddyWarning) {
    getMessage().warning(res.caddyWarning);
  } else if (res.caddyPatched) {
    getMessage().info(t('pages.tgWebProxy.toasts.caddyFixed'));
  }
  if (res.backendError) {
    getMessage().warning(res.backendError);
  }
}

export default function ProfilesTab({
  snapshot,
  loading,
  modal,
}: {
  snapshot: RelaySnapshot | undefined;
  loading: boolean;
  modal: ModalApi;
}) {
  const { t } = useTranslation();
  const { addProfile, updateProfile, deleteProfile, pending } = useTgWebProxyMutations();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<RelayProfile | null>(null);
  const [share, setShare] = useState<RelayShareInfo | null>(null);
  const [routeProfile, setRouteProfile] = useState<RelayProfile | null>(null);
  const [bindProfile, setBindProfile] = useState<string | null>(null);
  const [revealSecrets, setRevealSecrets] = useState<Record<string, boolean>>({});
  const profiles = snapshot?.profiles ?? [];

  const onSave = async (profile: RelayProfile) => {
    const msg = editing ? await updateProfile(editing.name, profile) : await addProfile(profile);
    if (msg?.success) {
      setFormOpen(false);
      reportApply(msg, t);
    }
  };

  const onDelete = (p: RelayProfile) =>
    modal.confirm({
      title: t('pages.tgWebProxy.profile.deleteConfirm', { name: p.name }),
      okText: t('delete'),
      okType: 'danger',
      cancelText: t('cancel'),
      onOk: async () => reportApply(await deleteProfile(p.name), t),
    });

  const columns = [
    {
      title: t('pages.tgWebProxy.profile.name'),
      dataIndex: 'name',
      key: 'name',
      render: (name: string) =>
        isManagedProfile(name) ? (
          <Space size={4}>
            {name}
            <Tooltip title={t('pages.tgWebProxy.bindings.managedHint')}>
              <Tag color="purple">{t('pages.tgWebProxy.bindings.managed')}</Tag>
            </Tooltip>
          </Space>
        ) : (
          name
        ),
    },
    {
      title: t('pages.tgWebProxy.secret'),
      dataIndex: 'secret',
      key: 'secret',
      render: (s: string, p: RelayProfile) => {
        const shown = !!revealSecrets[p.name];
        return (
          <Space size={4}>
            <Typography.Text code copyable={shown ? { text: s } : false}>
              {shown ? s : maskSecret(s)}
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
              onClick={() => setRevealSecrets((prev) => ({ ...prev, [p.name]: !shown }))}
            />
          </Space>
        );
      },
    },
    {
      title: t('pages.tgWebProxy.profile.backend'),
      dataIndex: 'backend',
      key: 'backend',
      render: (b: string) => <Typography.Text code>{b}</Typography.Text>,
    },
    {
      title: t('pages.tgWebProxy.profile.carrierMode'),
      dataIndex: 'carrier_mode',
      key: 'carrier_mode',
      render: (m: string | undefined) => <Tag>{m || 'https'}</Tag>,
    },
    {
      title: t('pages.tgWebProxy.profile.limits'),
      key: 'limits',
      render: (_: unknown, p: RelayProfile) =>
        p.limits ? <Tag color="blue">{Object.keys(p.limits).length}</Tag> : '-',
    },
    {
      title: '',
      key: 'actions',
      render: (_: unknown, p: RelayProfile) => (
        <Space size={4} wrap>
          <Button
            size="small"
            icon={<ShareAltOutlined />}
            onClick={async () => setShare(await fetchShare(p.name))}
          >
            {t('pages.tgWebProxy.share.button')}
          </Button>
          <Button
            size="small"
            icon={<UserAddOutlined />}
            disabled={isManagedProfile(p.name)}
            onClick={() => setBindProfile(p.name)}
          >
            {t('pages.tgWebProxy.bindings.addToSubs')}
          </Button>
          <ProfileEgressCheck profile={p} />
          <Button
            size="small"
            icon={<NodeIndexOutlined />}
            disabled={isManagedProfile(p.name)}
            onClick={() => setRouteProfile(p)}
          >
            {t('pages.tgWebProxy.routeVia.button')}
          </Button>
          <Button
            size="small"
            icon={<EditOutlined />}
            aria-label={t('edit')}
            disabled={isManagedProfile(p.name)}
            onClick={() => {
              setEditing(p);
              setFormOpen(true);
            }}
          />
          <Button
            size="small"
            danger
            icon={<DeleteOutlined />}
            aria-label={t('delete')}
            disabled={profiles.length <= 1 || isManagedProfile(p.name)}
            onClick={() => onDelete(p)}
          />
        </Space>
      ),
    },
  ];

  return (
    <>
      <Card
        size="small"
        title={t('pages.tgWebProxy.tabs.profiles')}
        extra={
          <Button
            type="primary"
            size="small"
            icon={<PlusOutlined />}
            disabled={!snapshot?.configExists}
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            {t('add')}
          </Button>
        }
      >
        {!snapshot?.configExists && (
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 12 }}
            title={t('pages.tgWebProxy.profile.needConfig')}
          />
        )}
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          title={t('pages.tgWebProxy.profile.backendWarning')}
        />
        <Table
          rowKey="name"
          size="small"
          loading={loading}
          dataSource={profiles}
          columns={columns}
          pagination={false}
          scroll={{ x: true }}
        />
        <ProfileFormModal
          open={formOpen}
          profile={editing}
          existing={profiles}
          saving={pending}
          onCancel={() => setFormOpen(false)}
          onSave={onSave}
        />
        <ShareModal share={share} onClose={() => setShare(null)} />
        {bindProfile != null && (
          <BindClientsModal
            key={bindProfile}
            open
            profileName={bindProfile}
            onClose={() => setBindProfile(null)}
          />
        )}
        <RouteViaOutboundModal
          profile={routeProfile}
          open={!!routeProfile}
          onClose={() => setRouteProfile(null)}
          onApplied={async (updated) => {
            reportApply(await updateProfile(updated.name, updated), t);
          }}
        />
      </Card>
    </>
  );
}
