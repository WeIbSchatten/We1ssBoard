import { useTranslation } from 'react-i18next';
import { Segmented } from 'antd';

export type TrafficPeriod = 'period' | 'all';

// "Current limit period" counters reset with the client; "all time" never does.
export default function PeriodToggle({
  value,
  onChange,
}: {
  value: TrafficPeriod;
  onChange: (v: TrafficPeriod) => void;
}) {
  const { t } = useTranslation();
  return (
    <Segmented<TrafficPeriod>
      size="small"
      value={value}
      onChange={onChange}
      options={[
        { value: 'period', label: t('pages.index.dash.periodCurrent') },
        { value: 'all', label: t('pages.index.dash.periodAll') },
      ]}
    />
  );
}
