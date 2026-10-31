import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Card, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';

import { SizeFormatter } from '@/utils';
import type { DashboardInbound } from './useDashboardData';

export interface InboundRow extends DashboardInbound {
  online: number;
  nodeName: string;
}

interface InboundsCardProps {
  inbounds: DashboardInbound[];
  onlineByInbound: Map<number, number>;
  nodeNames: Map<number, string>;
  limit?: number;
}

export default function InboundsCard({
  inbounds,
  onlineByInbound,
  nodeNames,
  limit = 8,
}: InboundsCardProps) {
  const { t } = useTranslation();
  const rows = useMemo<InboundRow[]>(
    () =>
      inbounds
        .map((ib) => ({
          ...ib,
          online: onlineByInbound.get(ib.id) ?? 0,
          nodeName: ib.nodeId ? (nodeNames.get(ib.nodeId) ?? `#${ib.nodeId}`) : '',
        }))
        .sort((a, b) => b.online - a.online || b.up + b.down - (a.up + a.down))
        .slice(0, limit),
    [inbounds, onlineByInbound, nodeNames, limit],
  );

  const columns: ColumnsType<InboundRow> = [
    {
      title: t('pages.index.dash.colInbound'),
      key: 'name',
      render: (_v, r) => (
        <div className="dash-cell-stack">
          <span className={r.enable ? '' : 'dash-muted'}>{r.remark || r.tag}</span>
          <small>{r.nodeName || t('pages.index.dash.local')}</small>
        </div>
      ),
    },
    {
      title: t('pages.index.dash.colProtocol'),
      key: 'protocol',
      render: (_v, r) => (
        <>
          <Tag>{r.protocol.toUpperCase()}</Tag>
          {r.port > 0 && <span className="ov-mono dash-muted">{r.port}</span>}
        </>
      ),
    },
    {
      title: t('pages.index.dash.colOnline'),
      key: 'online',
      align: 'right',
      render: (_v, r) => (
        <span className="ov-mono">
          {r.online}
          <span className="dash-muted">{` / ${r.clientStats?.length ?? 0}`}</span>
        </span>
      ),
    },
    {
      title: t('pages.index.dash.colTraffic'),
      key: 'traffic',
      align: 'right',
      render: (_v, r) => <span className="ov-mono">{SizeFormatter.sizeFormat(r.up + r.down)}</span>,
    },
  ];

  return (
    <Card className="dash-card">
      <div className="dash-card-head">
        <div className="ov-kicker">{t('pages.index.dash.inbounds')}</div>
        <Link to="/connections" className="dash-link">
          {t('pages.index.dash.openAll')}
        </Link>
      </div>
      <Table<InboundRow>
        size="small"
        rowKey="id"
        columns={columns}
        dataSource={rows}
        pagination={false}
        locale={{ emptyText: t('pages.index.dash.inboundsEmpty') }}
      />
    </Card>
  );
}
