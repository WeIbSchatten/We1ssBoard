import { describe, expect, it } from 'vitest';

import { panelUpdateProgress, taskProgressView } from '@/lib/updateProgress';
import type { TaskProgress } from '@/generated/zod';

const task = (p: Partial<TaskProgress>): TaskProgress => ({
  kind: 'xray',
  stage: 'download',
  file: '',
  step: 1,
  steps: 1,
  done: 0,
  total: 0,
  updatedAt: 0,
  ...p,
});

describe('panel update progress', () => {
  // update.sh reports one of six steps; the bar must move forward with each.
  it('advances through the update.sh steps in order', () => {
    const percents = ['download', 'verify', 'stop', 'install', 'configure', 'start'].map(
      (stage) => panelUpdateProgress(stage).percent,
    );
    expect(percents).toEqual([...percents].sort((a, b) => a - b));
    expect(new Set(percents).size).toBe(6);
    expect(panelUpdateProgress('install').current).toBe(3);
  });

  // An older update.sh writes no step; the bar must still show the first step, not jump.
  it('starts at the first step when the updater reports none', () => {
    expect(panelUpdateProgress(undefined)).toEqual({ current: 0, percent: 2 });
  });
});

describe('xray and geofile progress', () => {
  it('fills the download share of the bar from the bytes received', () => {
    expect(taskProgressView(task({ done: 50, total: 100 })).percent).toBe(35);
    expect(taskProgressView(task({ stage: 'verify' })).percent).toBe(75);
    expect(taskProgressView(task({ stage: 'restart' })).current).toBe(3);
    expect(taskProgressView(task({ kind: 'geofile', stage: 'restart' })).current).toBe(1);
  });

  // Six geofiles share the bar: the third file half done is 2.5 of 6 files in.
  it('spreads a geofile batch over its files', () => {
    const view = taskProgressView(
      task({ kind: 'geofile', file: 'geoip.dat', step: 3, steps: 6, done: 5, total: 10 }),
    );
    expect(view.percent).toBe(38);
    expect(view.file).toEqual({ step: 3, steps: 6, name: 'geoip.dat' });
  });

  it('marks a failed run without moving the bar', () => {
    const view = taskProgressView(task({ stage: 'failed', error: 'checksum mismatch' }));
    expect(view.failed).toBe(true);
  });
});
