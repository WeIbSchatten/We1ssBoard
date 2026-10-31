import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, Segmented, Tooltip } from 'antd';

import { SizeFormatter } from '@/utils';
import type { TrafficPoint } from '@/generated/zod';
import { useTrafficHistory, type TrafficRange } from './useDashboardData';

const CHART_H = 150;

function slotLabel(time: number, range: TrafficRange): string {
  const d = new Date(time * 1000);
  return range === '24h'
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

function TrafficBars({ points, range }: { points: TrafficPoint[]; range: TrafficRange }) {
  const { t } = useTranslation();
  const max = Math.max(0, ...points.map((p) => p.up + p.down));
  return (
    <div className="dash-bars" style={{ height: CHART_H }}>
      {points.map((p) => {
        const total = p.up + p.down;
        return (
          <Tooltip
            key={p.time}
            title={
              <>
                <div>{slotLabel(p.time, range)}</div>
                <div>{`↑ ${SizeFormatter.sizeFormat(p.up)} · ↓ ${SizeFormatter.sizeFormat(p.down)}`}</div>
              </>
            }
          >
            <div
              className="dash-bar"
              aria-label={`${slotLabel(p.time, range)}: ${SizeFormatter.sizeFormat(total)}`}
            >
              <span
                className="dash-bar-down"
                style={{ height: `${max ? (p.down / max) * 100 : 0}%` }}
              />
              <span
                className="dash-bar-up"
                style={{ height: `${max ? (p.up / max) * 100 : 0}%` }}
              />
            </div>
          </Tooltip>
        );
      })}
      {max === 0 && <div className="dash-empty">{t('pages.index.dash.trafficEmpty')}</div>}
    </div>
  );
}

export default function TrafficHistoryCard() {
  const { t } = useTranslation();
  const [range, setRange] = useState<TrafficRange>('24h');
  const { data: points = [] } = useTrafficHistory(range);
  const totals = useMemo(
    () =>
      points.reduce((acc, p) => ({ up: acc.up + p.up, down: acc.down + p.down }), {
        up: 0,
        down: 0,
      }),
    [points],
  );
  const first = points[0];
  const last = points[points.length - 1];

  return (
    <Card className="dash-card dash-traffic">
      <div className="dash-card-head">
        <div>
          <div className="ov-kicker">{t('pages.index.dash.traffic')}</div>
          <div className="dash-big">{SizeFormatter.sizeFormat(totals.up + totals.down)}</div>
          <div className="ov-sub">
            {`↑ ${SizeFormatter.sizeFormat(totals.up)} · ↓ ${SizeFormatter.sizeFormat(totals.down)}`}
          </div>
        </div>
        <Segmented<TrafficRange>
          size="small"
          value={range}
          onChange={setRange}
          options={[
            { value: '24h', label: t('pages.index.dash.range24h') },
            { value: '7d', label: t('pages.index.dash.range7d') },
            { value: '30d', label: t('pages.index.dash.range30d') },
          ]}
        />
      </div>
      <TrafficBars points={points} range={range} />
      {first && last && (
        <div className="dash-axis">
          <span>{slotLabel(first.time, range)}</span>
          <span>{slotLabel(last.time, range)}</span>
        </div>
      )}
    </Card>
  );
}
