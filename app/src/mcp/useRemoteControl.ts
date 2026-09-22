// src/mcp/useRemoteControl.ts
//
// Remote control: messages the user sends from their linked WhatsApp/Telegram are injected into
// whatever MCP conversation is open in this tab, and each run's final answer goes back to the
// phone. Mounted once, by MCPProvider, so it keeps listening while the chat panel is closed —
// "watch this for me", walk away, "how's it going?".
//
// `send` ignores calls while a run is in flight, so messages wait in a queue and are drained
// one at a time whenever the MCP is idle.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { TokenProvider } from '@utils/main_loop';
import { Logger } from '@utils/logging';
import { SensorSettings } from '@utils/settings';
import { fetchStatus, listenInbox, postReply, remotePrompt, type RemoteChannel, type RemoteMessage } from './remote';
import type { UseMCPReturn } from './useMCP';

/** What the settings card renders. `linked` is the server's view; the rest is this tab's. */
export interface RemoteControlState {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
  /** Null until the first status fetch answers (or while there is no code / no token). */
  linked: Record<RemoteChannel, boolean> | null;
  /** This tab is the one holding the session open for the phone. */
  listening: boolean;
  lastMessageAt: number | null;
}

const STATUS_POLL_MS = 60_000;

export function useRemoteControl(
  mcp: Pick<UseMCPReturn, 'send' | 'isRunning'>,
  getToken: TokenProvider,
): RemoteControlState {
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const queue = useRef<RemoteMessage[]>([]);
  const draining = useRef(false);
  // The inbox loop that owns the `listening` flag.
  const listenerRef = useRef<AbortController | null>(null);
  // Bumped to re-run the drain effect when a message arrives or a remote run finishes.
  const [wake, setWake] = useState(0);

  const [enabled, setEnabledState] = useState(() => SensorSettings.isRemoteControlEnabled());
  const [linked, setLinked] = useState<Record<RemoteChannel, boolean> | null>(null);
  const [listening, setListening] = useState(false);
  const [lastMessageAt, setLastMessageAt] = useState<number | null>(null);

  const setEnabled = useCallback((next: boolean) => {
    SensorSettings.setRemoteControlEnabled(next);
    setEnabledState(next);
  }, []);

  useEffect(() => {
    if (!enabled) {
      setListening(false);
      return;
    }
    const controller = new AbortController();
    listenerRef.current = controller;
    setListening(true);
    listenInbox({
      getCode: () => SensorSettings.getWhitelistCode(),
      getToken: () => getTokenRef.current(),
      signal: controller.signal,
      onMessage: message => {
        Logger.info('MCP', `Remote message received via ${message.channel}`);
        setLastMessageAt(Date.now());
        queue.current.push(message);
        setWake(n => n + 1);
      },
      // Only the current loop may clear the flag. A superseded loop (React re-running this
      // effect, e.g. StrictMode's double mount) settles after its replacement started, and
      // would otherwise leave the UI reading "connecting…" while the new loop polls happily.
    }).finally(() => { if (listenerRef.current === controller) setListening(false); });
    return () => controller.abort();
  }, [enabled]);

  // The link itself lives on the server and changes when the user scans a QR on their phone,
  // so it is polled rather than derived from anything in this tab. Runs even when disabled:
  // the settings card still wants to say what a re-enable would connect to.
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const code = SensorSettings.getWhitelistCode();
      const token = code ? await getTokenRef.current().catch(() => undefined) : undefined;
      if (!code || !token) {
        if (!cancelled) setLinked(null);
        return;
      }
      const status = await fetchStatus(code, token).catch(() => null);
      if (!cancelled && status) setLinked(status.linked);
    };
    check();
    const interval = window.setInterval(check, STATUS_POLL_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, [enabled, lastMessageAt]);

  useEffect(() => {
    if (mcp.isRunning || draining.current || queue.current.length === 0) return;
    const message = queue.current.shift()!;
    draining.current = true;

    (async () => {
      const answer = await mcp.send(remotePrompt(message));
      const token = await getTokenRef.current();
      if (answer && token) await postReply(message, answer.text, token, answer.images);
    })()
      .catch(error => Logger.error('MCP', `Remote reply failed: ${error instanceof Error ? error.message : String(error)}`))
      .finally(() => {
        draining.current = false;
        setWake(n => n + 1);
      });
  }, [mcp.isRunning, mcp.send, wake]);

  return { enabled, setEnabled, linked, listening, lastMessageAt };
}
