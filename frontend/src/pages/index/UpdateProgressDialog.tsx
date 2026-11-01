import { useTranslation } from 'react-i18next';
import { Modal, Progress, Steps, Typography } from 'antd';

export interface UpdateProgressState {
  title: string;
  steps: string[];
  current: number;
  percent: number;
  detail?: string;
  failed?: boolean;
}

// Shown while the panel, Xray or the geofiles update; it cannot be closed, the
// same way the old "don't refresh" spinner could not be dismissed.
export default function UpdateProgressDialog({ state }: { state: UpdateProgressState | null }) {
  const { t } = useTranslation();
  return (
    <Modal
      open={!!state}
      title={state?.title}
      footer={null}
      closable={false}
      maskClosable={false}
      keyboard={false}
      destroyOnHidden
    >
      {state && (
        <>
          <Progress
            percent={state.percent}
            status={state.failed ? 'exception' : state.percent >= 100 ? 'success' : 'active'}
            aria-label={state.title}
          />
          <Steps
            orientation="vertical"
            size="small"
            current={state.current}
            status={state.failed ? 'error' : 'process'}
            items={state.steps.map((title) => ({ title }))}
            style={{ marginTop: 16 }}
          />
          {state.detail && <Typography.Text type="secondary">{state.detail}</Typography.Text>}
          <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
            {t('pages.index.dontRefresh')}
          </Typography.Paragraph>
        </>
      )}
    </Modal>
  );
}
