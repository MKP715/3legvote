import { useEffect, useState } from 'react';
import { useLocation } from 'react-router';

const CHANNEL = 'third-legacy-tabs';
const myId = Math.random().toString(36).slice(2);

/**
 * Two windows editing the same election would overwrite each other (each saves the whole
 * election). The projector window only reads, so it is ignored. This warns the operator
 * rather than trying to merge.
 */
export function TabWarning() {
  const loc = useLocation();
  const assemblyId = loc.pathname.startsWith('/a/') ? loc.pathname.split('/')[2] : null;
  const editing = !!assemblyId && !loc.pathname.startsWith('/display/');
  const [others, setOthers] = useState(0);

  useEffect(() => {
    if (!editing || typeof BroadcastChannel === 'undefined') return;
    const seen = new Map<string, number>();
    let channel: BroadcastChannel;
    try {
      channel = new BroadcastChannel(CHANNEL);
    } catch {
      return;
    }
    const prune = () => {
      const now = Date.now();
      for (const [id, at] of seen) if (now - at > 9000) seen.delete(id);
      setOthers(seen.size);
    };
    channel.onmessage = (e: MessageEvent) => {
      const m = e.data as { id?: string; assemblyId?: string; reply?: boolean };
      if (!m || m.id === myId || m.assemblyId !== assemblyId) return;
      seen.set(m.id!, Date.now());
      prune();
      if (!m.reply) channel.postMessage({ id: myId, assemblyId, reply: true });
    };
    const ping = () => channel.postMessage({ id: myId, assemblyId });
    ping();
    const timer = window.setInterval(() => {
      prune();
      ping();
    }, 4000);
    return () => {
      window.clearInterval(timer);
      channel.close();
      setOthers(0);
    };
  }, [assemblyId, editing]);

  if (!others) return null;
  return (
    <div className="warn-box no-print">
      <strong>This election is open in another window or tab.</strong> Work in one window only — the last one to save wins, and counts entered in the
      other window can be overwritten. (The projector display is safe: it only reads.)
    </div>
  );
}
