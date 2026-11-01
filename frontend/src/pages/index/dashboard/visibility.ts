import type { ActiveConnection } from '@/schemas/client';

interface VisibilityInput<I extends { id: number; nodeId?: number | null }> {
  nodes: { id: number; hidden?: boolean }[];
  inbounds: I[];
  connections: Record<string, ActiveConnection[]>;
  online: string[];
}

// Strips everything that belongs to nodes marked hidden: their inbounds, the
// connections through them, and clients online only through them.
export function visibleDashboardData<I extends { id: number; nodeId?: number | null }>({
  nodes,
  inbounds,
  connections,
  online,
}: VisibilityInput<I>) {
  const hiddenNodes = new Set(nodes.filter((n) => n.hidden).map((n) => n.id));
  const visibleInbounds = inbounds.filter((ib) => ib.nodeId == null || !hiddenNodes.has(ib.nodeId));
  const visibleIds = new Set(visibleInbounds.map((ib) => ib.id));
  const visibleConnections: Record<string, ActiveConnection[]> = {};
  for (const [email, list] of Object.entries(connections)) {
    const kept = list.filter((c) => visibleIds.has(c.inboundId));
    if (kept.length > 0) visibleConnections[email] = kept;
  }
  return {
    inbounds: visibleInbounds,
    connections: visibleConnections,
    online: online.filter((email) => !(email in connections) || email in visibleConnections),
  };
}
