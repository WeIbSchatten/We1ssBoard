import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ApiOutlined,
  CloudServerOutlined,
  ThunderboltOutlined,
  UserOutlined,
  WarningOutlined,
} from '@ant-design/icons';

import { SizeFormatter } from '@/utils';

interface KpiProps {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  sub: ReactNode;
  tone?: 'ok' | 'warn' | 'bad';
}

function Kpi({ icon, label, value, sub, tone }: KpiProps) {
  return (
    <div className={`dash-kpi${tone ? ` dash-kpi--${tone}` : ''}`}>
      <div className="ov-kicker ov-kicker-icon">
        {icon}
        {label}
      </div>
      <div className="dash-kpi-value">{value}</div>
      <div className="ov-sub">{sub}</div>
    </div>
  );
}

export interface KpiTilesProps {
  online: number;
  clientsTotal: number;
  todayBytes: number;
  inboundsEnabled: number;
  inboundsTotal: number;
  inboundsBusy: number;
  nodesOnline: number;
  nodesTotal: number;
  attentionErrors: number;
  attentionTotal: number;
}

export default function KpiTiles(p: KpiTilesProps) {
  const { t } = useTranslation();
  return (
    <div className="dash-kpis">
      <Kpi
        icon={<UserOutlined />}
        label={t('pages.index.dash.kpiOnline')}
        value={p.online}
        sub={t('pages.index.dash.kpiOnlineSub', { total: p.clientsTotal })}
      />
      <Kpi
        icon={<ThunderboltOutlined />}
        label={t('pages.index.dash.kpiToday')}
        value={SizeFormatter.sizeFormat(p.todayBytes)}
        sub={t('pages.index.dash.kpiTodaySub')}
      />
      <Kpi
        icon={<ApiOutlined />}
        label={t('pages.index.dash.inbounds')}
        value={`${p.inboundsEnabled} / ${p.inboundsTotal}`}
        sub={t('pages.index.dash.kpiInboundsSub', { busy: p.inboundsBusy })}
      />
      <Kpi
        icon={<CloudServerOutlined />}
        label={t('pages.index.dash.nodes')}
        value={p.nodesTotal ? `${p.nodesOnline} / ${p.nodesTotal}` : '—'}
        sub={p.nodesTotal ? t('pages.index.dash.kpiNodesSub') : t('pages.index.dash.nodesEmpty')}
        tone={p.nodesTotal && p.nodesOnline < p.nodesTotal ? 'bad' : undefined}
      />
      <Kpi
        icon={<WarningOutlined />}
        label={t('pages.index.dash.attention')}
        value={p.attentionTotal}
        sub={
          p.attentionTotal
            ? t('pages.index.dash.kpiAttentionSub', { errors: p.attentionErrors })
            : t('pages.index.dash.attentionEmpty')
        }
        tone={p.attentionErrors ? 'bad' : p.attentionTotal ? 'warn' : 'ok'}
      />
    </div>
  );
}
