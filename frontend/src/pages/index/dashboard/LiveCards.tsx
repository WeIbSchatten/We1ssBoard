import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Card, Progress } from 'antd';

import { SizeFormatter } from '@/utils';
import type { InboundOption } from '@/hooks/useClients';
import type { ActiveConnection, ClientRecord } from '@/schemas/client';
import { ClientActiveConnection } from '@/pages/clients/RowCells';

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

export function TopClientsCard({ clients }: { clients: ClientRecord[] }) {
  const { t } = useTranslation();
  const used = (c: ClientRecord) => (c.traffic?.up ?? 0) + (c.traffic?.down ?? 0);
  const top = clients.filter((c) => used(c) > 0);
  const max = Math.max(1, ...top.map(used));
  return (
    <Card className="dash-card">
      <div className="dash-card-head">
        <div>
          <div className="ov-kicker">{t('pages.index.dash.topClients')}</div>
          <div className="ov-sub">{t('pages.index.dash.topClientsSub')}</div>
        </div>
      </div>
      {top.length === 0 ? (
        <div className="dash-empty">{t('pages.index.dash.topClientsEmpty')}</div>
      ) : (
        <ul className="dash-list">
          {top.map((c) => {
            const limit = c.totalGB ?? 0;
            return (
              <li key={c.email} className="dash-list-col">
                <div className="dash-list-row">
                  <span className="dash-ellipsis">{c.email}</span>
                  <span className="dash-list-end ov-mono">
                    {SizeFormatter.sizeFormat(used(c))}
                    {limit > 0 && (
                      <span className="dash-muted">{` / ${SizeFormatter.sizeFormat(limit)}`}</span>
                    )}
                  </span>
                </div>
                <Progress
                  percent={(used(c) / (limit > 0 ? limit : max)) * 100}
                  showInfo={false}
                  size="small"
                  status={limit > 0 && used(c) >= limit ? 'exception' : 'normal'}
                />
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
