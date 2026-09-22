// src/mcp/useRemoteControl.ts
//
// Remote control: messages the user sends from their linked WhatsApp/Telegram are injected into
// whatever MCP conversation is open in this tab, and each run's final answer goes back to the
// phone. Mounted once, by MCPProvider, so it keeps listening while the chat panel is closed —
// "watch this for me", walk away, "how's it going?".
//
// `send` ignores calls while a run is in flight, so messages wait in a queue and are drained
// one at a time whenever the MCP is idle.

import { useEffect, useRef, useState } from 'react';
import type { TokenProvider } from '@utils/main_loop';
import { Logger } from '@utils/logging';
import { SensorSettings } from '@utils/settings';
import { listenInbox, postReply, remotePrompt, type RemoteMessage } from './remote';
import type { UseMCPReturn } from './useMCP';

export function useRemoteControl(mcp: Pick<UseMCPReturn, 'send' | 'isRunning'>, getToken: TokenProvider) {
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const queue = useRef<RemoteMessage[]>([]);
  const draining = useRef(false);
  // Bumped to re-run the drain effect when a message arrives or a remote run finishes.
  const [wake, setWake] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    listenInbox({
      getCode: () => SensorSettings.getWhitelistCode(),
      getToken: () => getTokenRef.current(),
      signal: controller.signal,
      onMessage: message => {
        Logger.info('MCP', `Remote message received via ${message.channel}`);
        queue.current.push(message);
        setWake(n => n + 1);
      },
    });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (mcp.isRunning || draining.current || queue.current.length === 0) return;
    const message = queue.current.shift()!;
    draining.current = true;

    (async () => {
      const answer = await mcp.send(remotePrompt(message));
      const token = await getTokenRef.current();
      if (answer && token) await postReply(message, answer, token);
    })()
      .catch(error => Logger.error('MCP', `Remote reply failed: ${error instanceof Error ? error.message : String(error)}`))
      .finally(() => {
        draining.current = false;
        setWake(n => n + 1);
      });
  }, [mcp.isRunning, mcp.send, wake]);
}
