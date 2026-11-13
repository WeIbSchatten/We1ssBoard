import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Button, Empty, List, Popconfirm, Switch, Tabs, Tag, Typography } from 'antd';
import { KeyOutlined, LaptopOutlined, LinkOutlined, LockOutlined } from '@ant-design/icons';

import { ClipboardManager, IntlUtil, LanguageManager, SizeFormatter } from '@/utils';
import { getMessage } from '@/utils/messageBus';
import SubHero from '@/pages/sub/SubHero';
import SubLinksTab from '@/pages/sub/SubLinksTab';
import { daysUntil, resolveSubStatus } from '@/pages/sub/subPageModel';
import type { PortalProfile } from '@/schemas/portal';
import PortalChangePassword from './PortalChangePassword';
import { portalApi } from './portalApi';
import { isUnauthorized, portalErrorText } from './portalErrors';

interface Props {
  profile: PortalProfile;
  onChanged: () => Promise<unknown> | void;
  onUnauthorized: () => void;
}

const keyId = (k: { inboundId: number; hostId: number }) => `${k.inboundId}:${k.hostId}`;

function PortalKeys({
  profile,
  onChanged,
  onUnauthorized,
  readOnly,
}: Props & { readOnly: boolean }) {
  const { t } = useTranslation();
  const serverHidden = useMemo(
    () => new Set(profile.keys.filter((k) => k.hidden).map(keyId)),
    [profile.keys],
  );
  // The server copy wins once a write settles; pending only covers the request in flight.
  const [pending, setPending] = useState<Set<string> | null>(null);
  const hidden = pending ?? serverHidden;
  const visible = profile.keys.filter((k) => !hidden.has(keyId(k))).length;

  const toggle = async (id: string, on: boolean) => {
    const next = new Set(hidden);
    if (on) next.delete(id);
    else next.add(id);
    setPending(next);
    try {
      await portalApi.replaceHidden(
        profile.keys
          .filter((k) => next.has(keyId(k)))
          .map(({ inboundId, hostId }) => ({ inboundId, hostId })),
      );
    } catch (err) {
      if (isUnauthorized(err)) return onUnauthorized();
      getMessage().error(portalErrorText(t, err));
    } finally {
      await onChanged();
      setPending(null);
    }
  };

  return (
    <div className="portal-section">
      <Typography.Paragraph type="secondary">{t('portal.keys.hint')}</Typography.Paragraph>
      {visible <= 1 && !readOnly && (
        <Alert
          type="info"
          showIcon
          title={t('portal.keys.lastVisible')}
          className="portal-form-error"
        />
      )}
      <List
        dataSource={profile.keys}
        renderItem={(k) => {
          const on = !hidden.has(keyId(k));
          return (
            <List.Item
              className="portal-key"
              actions={[
                <Switch
                  key="on"
                  aria-label={k.remark}
                  checked={on}
                  disabled={readOnly || (on && visible <= 1)}
                  onChange={(value) => toggle(keyId(k), value)}
                />,
              ]}
            >
              <List.Item.Meta
                title={<span dir="auto">{k.remark}</span>}
                description={<Tag>{k.protocol}</Tag>}
              />
            </List.Item>
          );
        }}
      />
    </div>
  );
}

function PortalDevices({
  profile,
  onChanged,
  onUnauthorized,
  readOnly,
}: Props & { readOnly: boolean }) {
  const { t } = useTranslation();
  const lang = LanguageManager.getLanguage('subscription');

  const signOut = async (id: number) => {
    try {
      await portalApi.revokeDevice(id);
    } catch (err) {
      if (isUnauthorized(err)) return onUnauthorized();
      getMessage().error(portalErrorText(t, err));
    }
    await onChanged();
  };

  if (profile.devices.length === 0) {
    return <Empty className="portal-section" description={t('portal.devices.empty')} />;
  }
  return (
    <List
      className="portal-section"
      dataSource={profile.devices}
      renderItem={(d) => (
        <List.Item
          actions={[
            <Popconfirm
              key="out"
              title={t('portal.devices.confirm')}
              onConfirm={() => signOut(d.id)}
            >
              <Button danger size="small" disabled={readOnly}>
                {t('portal.devices.signOut')}
              </Button>
            </Popconfirm>,
          ]}
        >
          <List.Item.Meta
            title={<span dir="auto">{d.name}</span>}
            description={`${t('portal.devices.lastUsed')}: ${
              d.lastUsedAt > 0
                ? IntlUtil.formatDate(d.lastUsedAt, 'gregorian', lang)
                : t('portal.devices.never')
            }`}
          />
        </List.Item>
      )}
    />
  );
}

export default function PortalProfileView({ profile, onChanged, onUnauthorized }: Props) {
  const { t } = useTranslation();
  const lang = LanguageManager.getLanguage('subscription');
  const [now] = useState(() => Date.now());
  const usedByte = profile.up + profile.down;
  const status = resolveSubStatus(
    { enabled: profile.enable, usedByte, totalByte: profile.totalGB, expireMs: profile.expiryTime },
    now,
  );
  const readOnly = status === 'disabled' || status === 'expired';
  const copy = useCallback(
    async (value: string) => {
      if (await ClipboardManager.copyText(value)) getMessage().success(t('copied'));
    },
    [t],
  );
  const props = { profile, onChanged, onUnauthorized, readOnly };

  return (
    <>
      <SubHero
        status={status}
        daysLeft={daysUntil(profile.expiryTime, now)}
        usedByte={usedByte}
        totalByte={profile.totalGB}
        expireMs={profile.expiryTime}
        lastOnlineMs={0}
        download={SizeFormatter.sizeFormat(profile.down)}
        upload={SizeFormatter.sizeFormat(profile.up)}
        used={SizeFormatter.sizeFormat(usedByte)}
        total={profile.totalGB > 0 ? SizeFormatter.sizeFormat(profile.totalGB) : '∞'}
        remained={
          profile.totalGB > 0
            ? SizeFormatter.sizeFormat(Math.max(0, profile.totalGB - usedByte))
            : ''
        }
        datepicker="gregorian"
        lang={lang}
      />
      {readOnly && (
        <Alert type="warning" showIcon title={t('portal.readOnly')} className="portal-section" />
      )}
      <Tabs
        className="sub-tabs"
        tabBarGutter={24}
        items={[
          {
            key: 'subscription',
            icon: <LinkOutlined />,
            label: t('subscription.tabLinks'),
            children: (
              <SubLinksTab subUrl={profile.subUrl} subJsonUrl="" subClashUrl="" onCopy={copy} />
            ),
          },
          {
            key: 'keys',
            icon: <KeyOutlined />,
            label: t('portal.keys.title'),
            children: <PortalKeys {...props} />,
          },
          {
            key: 'devices',
            icon: <LaptopOutlined />,
            label: t('portal.devices.title'),
            children: <PortalDevices {...props} />,
          },
          {
            key: 'security',
            icon: <LockOutlined />,
            label: t('portal.security.title'),
            children: profile.ldap ? (
              <Alert
                type="info"
                showIcon
                title={t('portal.security.ldap')}
                className="portal-section"
              />
            ) : (
              <PortalChangePassword onDone={onChanged} onUnauthorized={onUnauthorized} />
            ),
          },
        ]}
      />
    </>
  );
}
