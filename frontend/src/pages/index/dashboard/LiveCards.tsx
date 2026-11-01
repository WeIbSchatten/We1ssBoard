import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Card, Progress } from 'antd';

import { SizeFormatter } from '@/utils';
import type { InboundOption } from '@/hooks/useClients';
import type { ActiveConnection, ClientRecord } from '@/schemas/client';
import { ClientActiveConnection } from '@/pages/clients/RowCells';
import PeriodToggle, { type TrafficPeriod } from './PeriodToggle';
import { useAllTimeTraffic } from './useDashboardData';

const PROTOCOL_COLORS: Record<string, string> = {
  vless: 'blue',
  vmess: 'geekblue',
  trojan: 'volcano',
  shadowsocks: 'green',
  hysteria: 'magenta',
  wireguard: 'cyan',
  mtproto: 'gold',
  amneziawg: 'yellow',
  tuic: 'orange',
};

const CONNECTED_LIMIT = 12;

interface ConnectedNowProps {
  online: string[];
  connections: Record<string, ActiveConnection[]>;
  inboundsById: Record<number, InboundOption>;
}

export function ConnectedNowCard({ online, connections, inboundsById }: ConnectedNowProps) {
  const { t } = useTranslation();
  const shown = [...online].sort((a, b) => a.localeCompare(b)).slice(0, CONNECTED_LIMIT);
  return (
    <Card className="dash-card">
      <div className="dash-card-head">
        <div className="ov-kicker">{t('pages.index.dash.connected')}</div>
        <span className="dash-count">{online.length}</span>
      </div>
      {shown.length === 0 ? (
        <div className="dash-empty">{t('pages.index.dash.connectedEmpty')}</div>
      ) : (
        <ul className="dash-list">
          {shown.map((email) => (
            <li key={email} className="dash-list-row">
              <span className="dash-dot dash-dot--ok" />
              <span className="dash-ellipsis">{email}</span>
              <span className="dash-list-end">
                <ClientActiveConnection
                  connections={connections[email]}
                  inboundsById={inboundsById}
                  protocolColors={PROTOCOL_COLORS}
                />
              </span>
            </li>
          ))}
        </ul>
      )}
      {online.length > shown.length && (
        <Link to="/clients" className="dash-link dash-more">
          {t('pages.index.dash.andMore', { count: online.length - shown.length })}
        </Link>
      )}
    </Card>
  );
}

interface TopRow {
  email: string;
  used: number;
  limit: number;
}

export function TopClientsCard({ clients }: { clients: ClientRecord[] }) {
  const { t } = useTranslation();
  const [period, setPeriod] = useState<TrafficPeriod>('period');
  const allTime = useAllTimeTraffic(period === 'all').data;
  const rows: TopRow[] =
    period === 'all'
      ? (allTime?.clients ?? []).map((c) => ({ email: c.email, used: c.up + c.down, limit: 0 }))
      : clients.map((c) => ({
          email: c.email,
          used: (c.traffic?.up ?? 0) + (c.traffic?.down ?? 0),
          limit: c.totalGB ?? 0,
        }));
  const top = rows.filter((r) => r.used > 0);
  const max = Math.max(1, ...top.map((r) => r.used));
  return (
    <Card className="dash-card">
      <div className="dash-card-head">
        <div>
          <div className="ov-kicker">{t('pages.index.dash.topClients')}</div>
          <div className="ov-sub">
            {period === 'all'
              ? t('pages.index.dash.topClientsAllSub')
              : t('pages.index.dash.topClientsSub')}
          </div>
        </div>
        <PeriodToggle value={period} onChange={setPeriod} />
      </div>
      {top.length === 0 ? (
        <div className="dash-empty">{t('pages.index.dash.topClientsEmpty')}</div>
      ) : (
        <ul className="dash-list">
          {top.map((r) => (
            <li key={r.email} className="dash-list-col">
              <div className="dash-list-row">
                <span className="dash-ellipsis">{r.email}</span>
                <span className="dash-list-end ov-mono">
                  {SizeFormatter.sizeFormat(r.used)}
                  {r.limit > 0 && (
                    <span className="dash-muted">{` / ${SizeFormatter.sizeFormat(r.limit)}`}</span>
                  )}
                </span>
              </div>
              <Progress
                percent={(r.used / (r.limit > 0 ? r.limit : max)) * 100}
                showInfo={false}
                size="small"
                status={r.limit > 0 && r.used >= r.limit ? 'exception' : 'normal'}
              />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
