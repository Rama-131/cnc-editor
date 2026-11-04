export const MAX_RECEIVED_CHARS = 2 * 1024 * 1024;

export function appendReceivedText(
  current: string,
  incoming: string,
  limit = MAX_RECEIVED_CHARS,
) {
  const available = Math.max(0, limit - current.length);
  return {
    text: current + incoming.slice(0, available),
    overflow: incoming.length > available,
  };
}
