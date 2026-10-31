import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Alert, Button, Empty, Modal, Space, Table, Tag, Tooltip, Typography } from 'antd';
import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  UserAddOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';

import { HttpUtil } from '@/utils';
import { parseMsg } from '@/utils/zodValidate';
import { RelayStatusSchema } from '@/generated/zod';
import type { RelayProfile, RelayStatus } from '@/generated/types';
import { isManagedProfile } from '@/lib/tgWebProxy';
import {
  useRemoteTgWebProxyProfileMutations,
  useRemoteTgWebProxySnapshot,
} from '@/api/queries/useTgWebProxy';
import BindClientsModal from '@/pages/tg-web-proxy/BindClientsModal';
import ProfileFormModal from '@/pages/tg-web-proxy/ProfileFormModal';
import { reportApply } from '@/pages/tg-web-proxy/ProfilesTab';

async function fetchRemoteStatus(nodeId: number): Promise<RelayStatus> {
  const msg = await HttpUtil.get(`/panel/api/nodes/remote/${nodeId}/tgWebProxy/status`, undefined, {
    silent: true,
  });
  if (!msg?.success) throw new Error(msg?.msg || 'Failed to fetch remote tg-web-proxy status');
  const validated = parseMsg(msg, RelayStatusSchema, 'nodes/remote/tgWebProxy/status');
  if (!validated.obj) throw new Error('Empty remote tg-web-proxy status');
  return validated.obj;
}

export default function RemoteTgWebProxyTab({ nodeId }: { nodeId: number }) {
  const { t } = useTranslation();
  const statusQuery = useQuery({
    queryKey: ['nodes', 'remote', nodeId, 'tgWebProxy', 'status'],
    queryFn: () => fetchRemoteStatus(nodeId),
    enabled: nodeId > 0,
  });
  const configQuery = useRemoteTgWebProxySnapshot(nodeId);

  const [modal, modalContextHolder] = Modal.useModal();
  const { addProfile, updateProfile, deleteProfile, pending } =
    useRemoteTgWebProxyProfileMutations(nodeId);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<RelayProfile | null>(null);
  const [bindProfile, setBindProfile] = useState<string | null>(null);

  const allProfiles = configQuery.data?.profiles ?? [];
  const profiles = allProfiles.filter((p) => !isManagedProfile(p.name));
  const configured = !!configQuery.data?.configExists;

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

  const columns: ColumnsType<RelayProfile> = [
    { title: t('pages.tgWebProxy.profile.name'), dataIndex: 'name' },
    { title: t('pages.tgWebProxy.profile.backend'), dataIndex: 'backend' },
    {
      title: t('pages.tgWebProxy.profile.carrierMode'),
      dataIndex: 'carrierMode',
      render: (v: string | undefined) => v || 'https',
    },
    {
      key: 'actions',
      align: 'right',
      render: (_: unknown, p: RelayProfile) => (
        <Space size={4} wrap>
          <Button size="small" icon={<UserAddOutlined />} onClick={() => setBindProfile(p.name)}>
            {t('pages.tgWebProxy.bindings.addToSubs')}
          </Button>
          <Tooltip title={t('edit')}>
            <Button
              size="small"
              icon={<EditOutlined />}
              aria-label={t('edit')}
              onClick={() => {
                setEditing(p);
                setFormOpen(true);
              }}
            />
          </Tooltip>
          <Tooltip title={t('delete')}>
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              aria-label={t('delete')}
              onClick={() => onDelete(p)}
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  const err = (statusQuery.error || configQuery.error) as Error | null;

  return (
    <Space orientation="vertical" style={{ width: '100%' }}>
      <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
        {t('pages.nodes.remote.tgWebProxyHint')}
      </Typography.Paragraph>
      {modalContextHolder}
      <Space wrap>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          disabled={!configured}
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          {t('pages.tgWebProxy.profile.add')}
        </Button>
        <Button
          icon={<ReloadOutlined />}
          onClick={() => {
            void statusQuery.refetch();
            void configQuery.refetch();
          }}
        >
          {t('refresh')}
        </Button>
      </Space>
      {err && <Alert type="error" showIcon title={err.message} />}
      {statusQuery.data && (
        <Space wrap>
          <Tag color={statusQuery.data.supported ? 'green' : 'default'}>
            {statusQuery.data.supported
              ? t('pages.tgWebProxy.installed')
              : t('pages.tgWebProxy.unsupported')}
          </Tag>
          {statusQuery.data.hostname && (
            <Tag>
              {t('pages.tgWebProxy.hostname')}: {statusQuery.data.hostname}
            </Tag>
          )}
          {statusQuery.data.job?.state && (
            <Tag>
              {t('pages.tgWebProxy.job')}: {statusQuery.data.job.state}
            </Tag>
          )}
        </Space>
      )}
      {!configQuery.data?.configExists && !configQuery.isLoading && !err && (
        <Alert type="info" showIcon title={t('pages.tgWebProxy.bindings.notConfigured')} />
      )}
      <Table<RelayProfile>
        rowKey="name"
        size="small"
        loading={configQuery.isFetching}
        dataSource={profiles}
        columns={columns}
        pagination={false}
        locale={{ emptyText: <Empty description={t('noData')} /> }}
        scroll={{ x: 'max-content' }}
      />
      <ProfileFormModal
        open={formOpen}
        profile={editing}
        existing={allProfiles}
        saving={pending}
        onCancel={() => setFormOpen(false)}
        onSave={(p) => void onSave(p)}
      />
      {bindProfile != null && (
        <BindClientsModal
          key={bindProfile}
          open
          profileName={bindProfile}
          nodeId={nodeId}
          onClose={() => setBindProfile(null)}
        />
      )}
    </Space>
  );
}
