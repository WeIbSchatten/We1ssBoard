// Inbounds a client may be attached to from the pickers: a hidden node's are left
// out unless already selected, so editing a client never drops an attachment.
export function pickableInbounds<T extends { id: number; hidden?: boolean }>(
  inbounds: readonly T[],
  selectedIds: readonly number[],
): T[] {
  return inbounds.filter((ib) => !ib.hidden || selectedIds.includes(ib.id));
}
