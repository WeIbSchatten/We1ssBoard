import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Card,
  Modal,
  Segmented,
  Select,
  Space,
  Switch,
  Tag,
  Transfer,
  Typography,
  message,
} from 'antd';
import type { TransferProps } from 'antd';

import { useClientOptions } from '@/api/queries/useClientOptions';
import {
  useRemoteTgWebProxySnapshot,
  useTgWebProxyBindingMutations,
  useTgWebProxyBindings,
  useTgWebProxyOverview,
  useTgWebProxySnapshot,
} from '@/api/queries/useTgWebProxy';
import { isManagedProfile } from '@/lib/tgWebProxy';
import ClientBindingsCard from './ClientBindingsCard';

interface ClientItem {
  key: string;
  title: string;
  elsewhere?: string;
}

// Concept A: pick a relay (this panel or a node), then move clients between
// "not bound" and "bound" for it. Binding a client bound elsewhere moves it.
export default function RelayUsersTab() {
  const { t } = useTranslation();
  const [modal, modalContextHolder] = Modal.useModal();
  const overview = useTgWebProxyOverview().data;
  const relays = useMemo(() => overview ?? [], [overview]);
  const [messageApi, messageContextHolder] = message.useMessage();
  const [relayId, setRelayId] = useState(0);
  const clients = useClientOptions();
  const bindings = useTgWebProxyBindings();
  const localSnapshot = useTgWebProxySnapshot();
  const remoteSnapshot = useRemoteTgWebProxySnapshot(relayId);
  const { bindClients, unbindClient, pending } = useTgWebProxyBindingMutations();
  const [profileChoice, setProfileChoice] = useState<Record<number, string>>({});
  const [dedicated, setDedicated] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);

  const relayName = useCallback(
    (nodeId: number) =>
      nodeId === 0
        ? t('pages.tgWebProxy.bindings.local')
        : (relays.find((r) => r.nodeId === nodeId)?.name ?? `#${nodeId}`),
    [relays, t],
  );

  const snapshot = relayId === 0 ? localSnapshot.data : remoteSnapshot.data;
  const profiles = useMemo(
    () => (snapshot?.profiles ?? []).map((p) => p.name).filter((n) => !isManagedProfile(n)),
    [snapshot],
  );
  const profile = profileChoice[relayId] ?? profiles[0] ?? '';
  const remote = relayId !== 0;

  const { items, boundHere } = useMemo(() => {
    const relayOf = new Map<string, number>();
    for (const b of bindings.data?.bindings ?? []) relayOf.set(b.email, b.nodeId ?? 0);
    const list: ClientItem[] = (clients.data ?? []).map((email) => {
      const on = relayOf.get(email);
      return {
        key: email,
        title: email,
        elsewhere: on != null && on !== relayId ? relayName(on) : undefined,
      };
    });
    return {
      items: list,
      boundHere: list.filter((c) => relayOf.get(c.key) === relayId).map((c) => c.key),
    };
  }, [clients.data, bindings.data, relayId, relayName]);

  const onChange: TransferProps<ClientItem>['onChange'] = async (_next, direction, moved) => {
    const emails = moved.map(String);
    if (direction === 'right') {
      if (!profile) {
        void messageApi.warning(t('pages.tgWebProxy.users.pickProfile'));
        return;
      }
      const msg = await bindClients({
        emails,
        profileName: profile,
        dedicated: remote || dedicated,
        ...(remote ? { nodeId: relayId } : {}),
      });
      if (msg?.success) setSelected([]);
      return;
    }
    for (const email of emails) {
      const msg = await unbindClient(email);
      if (!msg?.success) return;
    }
    setSelected([]);
  };

  if (relays.length === 0) {
    return <Alert type="info" showIcon title={t('pages.tgWebProxy.users.noRelays')} />;
  }

  return (
    <Space orientation="vertical" size={16} style={{ width: '100%' }}>
      {modalContextHolder}
      {messageContextHolder}
      <Card size="small">
        <Space orientation="vertical" size={12} style={{ width: '100%' }}>
          <Typography.Text type="secondary">{t('pages.tgWebProxy.users.hint')}</Typography.Text>
          <Segmented<number>
            value={relayId}
            onChange={(v) => {
              setRelayId(v);
              setSelected([]);
            }}
            options={relays.map((r) => ({
              value: r.nodeId,
              label: `${relayName(r.nodeId)} · ${r.clients}`,
            }))}
          />
          <Space wrap align="center">
            <span>{t('pages.tgWebProxy.bindings.profile')}</span>
            <Select
              aria-label={t('pages.tgWebProxy.bindings.profile')}
              style={{ minWidth: 200 }}
              value={profile || undefined}
              loading={relayId === 0 ? localSnapshot.isLoading : remoteSnapshot.isLoading}
              onChange={(v: string) => setProfileChoice((prev) => ({ ...prev, [relayId]: v }))}
              options={profiles.map((name) => ({ value: name, label: name }))}
              notFoundContent={t('pages.tgWebProxy.users.noProfiles')}
            />
            <Switch checked={remote || dedicated} disabled={remote} onChange={setDedicated} />
            <span>{t('pages.tgWebProxy.bindings.dedicated')}</span>
          </Space>
          {remote && (
            <Typography.Text type="secondary">
              {t('pages.tgWebProxy.bindings.remoteHint')}
            </Typography.Text>
          )}
          <Transfer<ClientItem>
            dataSource={items}
            targetKeys={boundHere}
            selectedKeys={selected}
            onSelectChange={(source, target) => setSelected([...source, ...target].map(String))}
            onChange={(next, direction, moved) => void onChange(next, direction, moved)}
            titles={[t('pages.tgWebProxy.users.notBound'), t('pages.tgWebProxy.users.bound')]}
            actions={[t('pages.tgWebProxy.users.bind'), t('pages.tgWebProxy.users.unbind')]}
            showSearch
            disabled={pending}
            styles={{ section: { flex: 1, height: 380 } }}
            render={(item) => (
              <span>
                {item.title}
                {item.elsewhere && (
                  <Tag style={{ marginInlineStart: 8 }}>
                    {t('pages.tgWebProxy.users.elsewhere', { name: item.elsewhere })}
                  </Tag>
                )}
              </span>
            )}
          />
        </Space>
      </Card>
      <ClientBindingsCard modal={modal} nodeId={relayId} />
    </Space>
  );
}
