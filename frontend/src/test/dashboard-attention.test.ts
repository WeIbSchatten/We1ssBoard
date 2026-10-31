import { describe, expect, it } from 'vitest';

import { buildAttention, type AttentionInput } from '@/pages/index/dashboard/attention';

const calm: AttentionInput = {
  xrayState: 'running',
  xrayError: '',
  resources: [
    { key: 'cpu', percent: 20 },
    { key: 'memory', percent: 40 },
    { key: 'storage', percent: 50 },
  ],
  nodes: [{ name: 'de-1', enable: true, status: 'online', xrayState: 'running' }],
  outbounds: [{ tag: 'warp', alive: true }],
  depletedCount: 0,
  expiringCount: 0,
};

describe('dashboard attention list', () => {
  it('is empty when nothing needs a look', () => {
    expect(buildAttention(calm)).toEqual([]);
  });

  // Errors (something is down) come before warnings (something will be), and
  // each item links to the page where it gets fixed.
  it('lists every problem, errors first, with where to fix it', () => {
    const items = buildAttention({
      ...calm,
      xrayState: 'error',
      xrayError: 'exit status 23',
      resources: [
        { key: 'cpu', percent: 95 },
        { key: 'memory', percent: 85 },
        { key: 'storage', percent: 50 },
      ],
      nodes: [
        { name: 'de-1', enable: true, status: 'offline', xrayState: '' },
        { name: 'nl-2', enable: true, status: 'online', xrayState: 'error' },
        { name: 'off', enable: false, status: 'offline', xrayState: '' },
      ],
      outbounds: [
        { tag: 'warp', alive: false },
        { tag: 'direct', alive: true },
      ],
      depletedCount: 3,
      expiringCount: 2,
    });
    expect(items).toEqual([
      { id: 'xray', level: 'error', key: 'attXrayError', params: { msg: 'exit status 23' } },
      { id: 'res-cpu', level: 'error', key: 'attResource', params: { name: 'cpu', value: 95 } },
      {
        id: 'node-de-1',
        level: 'error',
        key: 'attNodeOffline',
        params: { name: 'de-1' },
        to: '/nodes',
      },
      {
        id: 'node-xray-nl-2',
        level: 'error',
        key: 'attNodeXray',
        params: { name: 'nl-2' },
        to: '/nodes',
      },
      {
        id: 'out-warp',
        level: 'error',
        key: 'attOutboundDown',
        params: { tag: 'warp' },
        to: '/connections#outbounds',
      },
      { id: 'depleted', level: 'error', key: 'attDepleted', params: { count: 3 }, to: '/clients' },
      {
        id: 'res-memory',
        level: 'warning',
        key: 'attResource',
        params: { name: 'memory', value: 85 },
      },
      {
        id: 'expiring',
        level: 'warning',
        key: 'attExpiring',
        params: { count: 2 },
        to: '/clients',
      },
    ]);
  });

  // A stopped core is not an error message, but it still means nobody can connect.
  it('flags a stopped Xray without an error text', () => {
    expect(buildAttention({ ...calm, xrayState: 'stop' })).toEqual([
      { id: 'xray', level: 'error', key: 'attXrayStopped', params: {} },
    ]);
  });
});
