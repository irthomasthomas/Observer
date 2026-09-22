// src/mcp/remote.ts
//
// Remote-control transport: lets the user talk to this tab's MCP from WhatsApp or Telegram.
// Framework-free, like runner.ts. The API is only a mailbox (api/remote.py): messages from the
// user's linked phone/chat are long-polled here, and the MCP's answers are posted back.
//
// The session id is the user's whitelist code (SensorSettings.getWhitelistCode) — the same
// passphrase ask_user_info's QR already has them send — so pairing needs no extra step.

import type { TokenProvider } from '@utils/main_loop';

const API_HOST = 'https://api.observer-ai.com';

export type RemoteChannel = 'whatsapp' | 'telegram';

export interface RemoteMessage {
  code: string;
  channel: RemoteChannel;
  text: string;
}

const MAX_BACKOFF_MS = 15_000;   // stay under the server's 45s "session active" TTL
const IDLE_RECHECK_MS = 10_000;  // no code / not logged in yet
const NOT_OWNER_RECHECK_MS = 60_000;

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    if (signal.aborted) return resolve();
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
  });
}

/**
 * Long-poll the inbox until `signal` aborts. Each request also tells the server this session
 * is active; while no tab is polling, the phone gets "no Observer session is active" instead.
 * `getCode` is re-read every loop so a code minted or rotated later is picked up.
 */
export async function listenInbox(opts: {
  getCode: () => string | null;
  getToken: TokenProvider;
  signal: AbortSignal;
  onMessage: (message: RemoteMessage) => void;
}): Promise<void> {
  const { getCode, getToken, signal, onMessage } = opts;
  let backoff = 1000;

  while (!signal.aborted) {
    const code = getCode();
    const token = code ? await getToken().catch(() => undefined) : undefined;
    if (!code || !token) {
      await sleep(IDLE_RECHECK_MS, signal);
      continue;
    }

    try {
      const response = await fetch(`${API_HOST}/remote/inbox?code=${encodeURIComponent(code)}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal,
      });
      // 403: the code hasn't been claimed by this account yet (it is claimed the first time
      // the whitelist modal polls it). Nothing to receive until then.
      if (response.status === 403) {
        await sleep(NOT_OWNER_RECHECK_MS, signal);
        continue;
      }
      if (!response.ok) throw new Error(`Inbox poll failed: ${response.status}`);

      const data = await response.json();
      for (const m of data.messages ?? []) onMessage({ code, channel: m.channel, text: m.text });
      backoff = 1000;
    } catch {
      if (signal.aborted) return;
      await sleep(backoff, signal);
      backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
    }
  }
}

const CHANNEL_NAME: Record<RemoteChannel, string> = {
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
};

/** What the model sees for a remote message: the text plus why it should answer differently.
 *  The prefix stays on the wire (the model needs it on every replay); the UI strips it via
 *  parseRemotePrompt and shows a channel icon instead. */
export function remotePrompt(message: RemoteMessage): string {
  return (
    `[Sent from the user's phone via ${CHANNEL_NAME[message.channel]}. They are away from the computer: ` +
    `keep the answer short, and ask for anything you need in chat instead of calling ask_user_info.]\n\n` +
    message.text
  );
}

const REMOTE_PREFIX = /^\[Sent from the user's phone via (WhatsApp|Telegram)\.[^\]]*\]\n\n/;

/** Splits a remotePrompt back into its channel and the user's own text; null for normal messages. */
export function parseRemotePrompt(text: string): { channel: RemoteChannel; text: string } | null {
  const match = REMOTE_PREFIX.exec(text);
  if (!match) return null;
  return { channel: match[1] === 'WhatsApp' ? 'whatsapp' : 'telegram', text: text.slice(match[0].length) };
}

export interface RemoteStatus {
  linked: Record<RemoteChannel, boolean>;
}

/** Which channels the code is linked to. 403 (not this account's code) reads as "nothing linked". */
export async function fetchStatus(code: string, token: string): Promise<RemoteStatus> {
  const response = await fetch(`${API_HOST}/remote/status?code=${encodeURIComponent(code)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) return { linked: { whatsapp: false, telegram: false } };
  return await response.json();
}

/** Send the MCP's answer back to the phone/chat the message came from. */
export async function postReply(message: RemoteMessage, text: string, token: string): Promise<void> {
  const response = await fetch(`${API_HOST}/remote/reply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ code: message.code, channel: message.channel, text: text.slice(0, 4000) }),
  });
  if (!response.ok) throw new Error(`Remote reply failed: ${response.status}`);
}
