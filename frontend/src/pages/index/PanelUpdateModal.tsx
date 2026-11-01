import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Button, Modal, Switch, Tag } from 'antd';
import { CloudDownloadOutlined } from '@ant-design/icons';

import { HttpUtil, PromiseUtil } from '@/utils';
import { formatPanelVersion } from '@/lib/panel-version';
import { PANEL_UPDATE_STAGES, panelUpdateProgress } from '@/lib/updateProgress';
import type { PanelUpdateStatus } from '@/generated/types';
import PanelChangelog from './PanelChangelog';
import type { UpdateProgressState } from './UpdateProgressDialog';
import './PanelUpdateModal.css';

type UpdateOutcome = 'success' | 'failed' | 'timeout';

const PANEL_STAGE_KEYS: Record<(typeof PANEL_UPDATE_STAGES)[number], string> = {
  download: 'pages.index.progress.download',
  verify: 'pages.index.progress.verify',
  stop: 'pages.index.progress.stop',
  install: 'pages.index.progress.install',
  configure: 'pages.index.progress.configure',
  start: 'pages.index.progress.start',
};

export interface PanelUpdateInfo {
  channel?: string;
  currentVersion: string;
  latestVersion: string;
  currentCommit?: string;
  latestCommit?: string;
  updateAvailable: boolean;
}

interface PanelUpdateModalProps {
  open: boolean;
  info: PanelUpdateInfo;
  devChannelEnable?: boolean;
  onChannelChange?: (dev: boolean) => void | Promise<void>;
  onClose: () => void;
  onProgress: (state: UpdateProgressState | null) => void;
}

// A run that keeps reporting new steps is alive; only this long without one is a timeout.
const UPDATE_STALL_MS = 90_000;

export default function PanelUpdateModal({
  open,
  info,
  devChannelEnable,
  onChannelChange,
  onClose,
  onProgress,
}: PanelUpdateModalProps) {
  const { t } = useTranslation();
  const [modal, contextHolder] = Modal.useModal();
  const [channelBusy, setChannelBusy] = useState(false);

  const isDev = info.channel === 'dev';

  function showStage(stage: string | undefined, restarting: boolean) {
    const { current, percent } = panelUpdateProgress(stage);
    onProgress({
      title: info.latestVersion
        ? `${t('pages.index.updatePanel')} · ${info.latestVersion}`
        : t('pages.index.updatePanel'),
      steps: PANEL_UPDATE_STAGES.map((s) => t(PANEL_STAGE_KEYS[s])),
      current,
      percent,
      detail: restarting ? t('pages.index.progress.restarting') : undefined,
    });
  }

  async function pollUpdateStatus(expectedRunId: string): Promise<UpdateOutcome> {
    let stage: string | undefined;
    let lastChange = Date.now();
    while (Date.now() - lastChange < UPDATE_STALL_MS) {
      await PromiseUtil.sleep(1500);
      try {
        const msg = await HttpUtil.get<PanelUpdateStatus>(
          '/panel/api/server/getUpdateStatus',
          undefined,
          { silent: true, timeout: 2000 },
        );
        const status = msg?.obj ?? undefined;
        if (status?.runId === expectedRunId) {
          if (status.state === 'success') return 'success';
          if (status.state === 'failed') return 'failed';
          if (status.stage && status.stage !== stage) {
            stage = status.stage;
            lastChange = Date.now();
          }
        }
        showStage(stage, false);
      } catch {
        showStage(stage, true);
      }
    }
    return 'timeout';
  }

  async function handleChannel(checked: boolean) {
    if (!onChannelChange) return;
    setChannelBusy(true);
    try {
      await onChannelChange(checked);
    } finally {
      setChannelBusy(false);
    }
  }

  async function runPanelUpdate() {
    onClose();
    showStage(undefined, false);
    const result = await HttpUtil.post<{ runId: string }>('/panel/api/server/updatePanel');
    if (!result?.success) {
      onProgress(null);
      return;
    }
    const outcome = await pollUpdateStatus(result.obj?.runId ?? '');
    if (outcome === 'success') {
      onProgress({
        title: t('pages.index.updatePanel'),
        steps: PANEL_UPDATE_STAGES.map((s) => t(PANEL_STAGE_KEYS[s])),
        current: PANEL_UPDATE_STAGES.length,
        percent: 100,
      });
      await PromiseUtil.sleep(800);
      window.location.reload();
      return;
    }
    onProgress(null);
    modal[outcome === 'failed' ? 'error' : 'warning']({
      title: t(
        outcome === 'failed'
          ? 'pages.index.panelUpdateFailedTitle'
          : 'pages.index.panelUpdateUnknownTitle',
      ),
      content: t(
        outcome === 'failed'
          ? 'pages.index.panelUpdateFailedDesc'
          : 'pages.index.panelUpdateUnknownDesc',
      ),
      okText: t('refresh'),
      onOk: () => window.location.reload(),
    });
  }

  function updatePanel() {
    modal.confirm({
      title: t('pages.index.panelUpdateDialog'),
      content: t('pages.index.panelUpdateDialogDesc').replace(
        '#version#',
        info.latestVersion || '',
      ),
      okText: t('confirm'),
      cancelText: t('cancel'),
      onOk: () => {
        void runPanelUpdate();
      },
    });
  }

  return (
    <>
      {contextHolder}
      <Modal open={open} title={t('pages.index.updatePanel')} footer={null} onCancel={onClose}>
        {info.updateAvailable && (
          <Alert
            type="warning"
            className="mb-12"
            title={t('pages.index.panelUpdateDesc')}
            showIcon
          />
        )}

        <div className="version-list">
          <div className="version-list-item">
            <span>{t('pages.index.devChannel')}</span>
            <Switch checked={!!devChannelEnable} loading={channelBusy} onChange={handleChannel} />
          </div>
        </div>

        {devChannelEnable && (
          <Alert
            type="info"
            className="mb-12"
            title={t('pages.index.devChannelWarning')}
            showIcon
          />
        )}

        <div className="version-list">
          <div className="version-list-item">
            <span>
              {isDev ? t('pages.index.currentCommit') : t('pages.index.currentPanelVersion')}
            </span>
            {isDev ? (
              <Tag color="green">{info.currentCommit || '?'}</Tag>
            ) : (
              <Tag color="green">
                {formatPanelVersion(window.X_UI_CUR_VER || info.currentVersion) || '?'}
              </Tag>
            )}
          </div>
          {info.updateAvailable ? (
            <div className="version-list-item">
              <span>
                {isDev ? t('pages.index.latestCommit') : t('pages.index.latestPanelVersion')}
              </span>
              <Tag color="purple">{(isDev ? info.latestCommit : info.latestVersion) || '-'}</Tag>
            </div>
          ) : (
            <div className="version-list-item">
              <span>{t('pages.index.panelUpToDate')}</span>
              <Tag color="green">{t('pages.index.panelUpToDate')}</Tag>
            </div>
          )}
        </div>

        {open && <PanelChangelog updateAvailable={info.updateAvailable} />}

        <div className="actions-row">
          <Button
            type="primary"
            disabled={!info.updateAvailable}
            onClick={updatePanel}
            icon={<CloudDownloadOutlined />}
          >
            {t('pages.index.updatePanel')}
          </Button>
        </div>
      </Modal>
    </>
  );
}
