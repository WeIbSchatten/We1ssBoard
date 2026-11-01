import type { TaskProgress } from '@/generated/zod';

// Steps update.sh writes to the status file, in the order it runs them.
export const PANEL_UPDATE_STAGES = [
  'download',
  'verify',
  'stop',
  'install',
  'configure',
  'start',
] as const;

// A geofile is checked while it downloads, so its run has no separate verify or install step.
export const TASK_STAGES = {
  xray: ['download', 'verify', 'install', 'restart'],
  geofile: ['download', 'restart'],
} as const;

export type TaskKind = keyof typeof TASK_STAGES;

export function panelUpdateProgress(stage: string | undefined): {
  current: number;
  percent: number;
} {
  const index = PANEL_UPDATE_STAGES.indexOf(stage as (typeof PANEL_UPDATE_STAGES)[number]);
  if (index < 0) return { current: 0, percent: 2 };
  return {
    current: index,
    percent: Math.round(((index + 0.5) / PANEL_UPDATE_STAGES.length) * 100),
  };
}

export interface TaskProgressView {
  current: number;
  percent: number;
  failed: boolean;
  file?: { step: number; steps: number; name: string };
}

// Downloads take most of the time, so they own most of the bar: 70% for the Xray
// archive, 90% split across the files of a geofile batch.
export function taskProgressView(p: TaskProgress): TaskProgressView {
  const fraction = p.total > 0 ? Math.min(p.done / p.total, 1) : 0;
  const steps = Math.max(p.steps, 1);
  const file = p.kind === 'geofile' && p.file ? { step: p.step, steps, name: p.file } : undefined;
  const failed = p.stage === 'failed';
  let percent: number;
  switch (p.stage) {
    case 'download':
      percent =
        p.kind === 'geofile' ? (90 * (Math.max(p.step, 1) - 1 + fraction)) / steps : 70 * fraction;
      break;
    case 'verify':
      percent = 75;
      break;
    case 'install':
      percent = 85;
      break;
    case 'restart':
      percent = 95;
      break;
    case 'done':
      percent = 100;
      break;
    default:
      percent = 0;
  }
  const stages: readonly string[] = TASK_STAGES[p.kind === 'geofile' ? 'geofile' : 'xray'];
  return {
    current: p.stage === 'done' ? stages.length : Math.max(stages.indexOf(p.stage), 0),
    percent: Math.round(percent),
    failed,
    file,
  };
}
