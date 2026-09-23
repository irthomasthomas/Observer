// Front-and-center card on the Settings home: the whitelist phrase + saved notification contacts
// collected by the `ask_user_info` MCP tool.
import React, { useState } from 'react';
import { Eye, EyeOff, Copy, Check, QrCode, RefreshCw, Pencil, CheckCircle2, XCircle, ExternalLink } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useAuth } from '@contexts/AuthContext';
import { SensorSettings } from '@utils/settings';
import { useWhitelistPolling } from '@components/whitelist/shared';
import WhitelistQR from '@components/whitelist/WhitelistQR';
import Switch from './Switch';
import { useMCPContext } from '../../mcp/MCPContext';
import type { UserInfoKind } from '../../mcp/types';
import {
  CONTACT_LABEL, CONTACT_PLACEHOLDER, contactError, contactValid, normalizeContact,
  TELEGRAM_BOT, telegramCodeLink,
} from '@utils/contactInfo';

const KINDS: UserInfoKind[] = ['discord', 'pushover'];
const SECRET_KINDS: UserInfoKind[] = ['discord', 'pushover'];

const ContactRow: React.FC<{ kind: UserInfoKind }> = ({ kind }) => {
  const [value, setValue] = useState(SensorSettings.getNotificationContact(kind));
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const err = contactError(kind, draft);

  const save = () => {
    const next = draft.trim() ? normalizeContact(kind, draft) : '';
    SensorSettings.setNotificationContact(kind, next);
    setValue(next);
    setEditing(false);
  };

  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-xs text-gray-500 dark:text-gray-400">{CONTACT_LABEL[kind]}</p>
        {editing ? (
          <div className="mt-1">
            <input
              autoFocus
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && (!draft.trim() || contactValid(kind, draft)) && save()}
              placeholder={CONTACT_PLACEHOLDER[kind]}
              className="block w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            {err && <p className="text-xs text-red-500 mt-1">{err}</p>}
          </div>
        ) : (
          <p className="text-sm text-gray-900 dark:text-gray-100 truncate">
            {value ? (SECRET_KINDS.includes(kind) ? '••••••••' + value.slice(-4) : value) : <span className="text-gray-400">Not set</span>}
          </p>
        )}
      </div>
      {editing ? (
        <div className="flex gap-2 flex-shrink-0">
          <button onClick={() => setEditing(false)} className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">Cancel</button>
          <button
            onClick={save}
            disabled={!!draft.trim() && !contactValid(kind, draft)}
            className="text-xs font-medium text-purple-600 disabled:opacity-40"
          >Save</button>
        </div>
      ) : (
        <button
          onClick={() => { setDraft(value); setEditing(true); }}
          className="p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 flex-shrink-0"
          aria-label={`Edit ${CONTACT_LABEL[kind]}`}
        >
          <Pencil className="h-4 w-4" />
        </button>
      )}
    </div>
  );
};

/**
 * Chatting with Observer from the phone that's linked to the phrase — same phrase, same card,
 * just a different channel capability. `linked` comes from the API (only the server knows which
 * phone bound the code); `listening` is this tab holding the session open — with it off, the bot
 * tells the phone no session is active.
 */
const RemoteControlStatus: React.FC<{ hasCode: boolean }> = ({ hasCode }) => {
  const { remote } = useMCPContext();
  const linkedChannels = remote.linked
    ? (['whatsapp', 'telegram'] as const).filter(c => remote.linked![c])
    : [];

  const status = !hasCode || linkedChannels.length === 0
    ? 'Not chatting yet — link WhatsApp or Telegram above'
    : `Chat linked via ${linkedChannels.map(c => (c === 'whatsapp' ? 'WhatsApp' : 'Telegram')).join(' · ')}${
        remote.enabled ? (remote.listening ? ' · listening' : ' · connecting…') : ''
      }`;

  return (
    <div className="mt-3 flex items-center justify-between gap-3 pt-3 border-t border-gray-100 dark:border-gray-800">
      <p className="text-xs text-gray-500 dark:text-gray-400 min-w-0">{status}</p>
      <Switch
        checked={remote.enabled}
        onChange={() => remote.setEnabled(!remote.enabled)}
        label="Toggle remote control"
      />
    </div>
  );
};

const UserInfoCard: React.FC = () => {
  const { getAccessToken } = useAuth();
  const [code, setCode] = useState<string | null>(SensorSettings.getWhitelistCode());
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [qrTab, setQrTab] = useState<'whatsapp' | 'telegram'>('whatsapp');
  // Connected means paired on either channel: WhatsApp (phone alerts) or Telegram.
  const codeEntries = code ? [{ number: code, isWhitelisted: false }] : [];
  const { allWhitelisted: phoneConnected } = useWhitelistPolling(codeEntries, getAccessToken, undefined, !!code);
  const { allWhitelisted: telegramConnected } = useWhitelistPolling(codeEntries, getAccessToken, 'telegram', !!code);
  const verified = phoneConnected || telegramConnected;

  const copy = () => {
    if (!code) return;
    navigator.clipboard.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  };

  const rotate = () => {
    if (!window.confirm('Generate a new phrase? Agents built with the current phrase keep sending to the phone it is connected to; new agents will use the new one.')) return;
    setCode(SensorSettings.rotateWhitelistCode());
    setRevealed(true);
    setShowQR(true);
  };

  return (
    <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 divide-y divide-gray-100 dark:divide-gray-800 overflow-hidden">
      <div className="px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Your phrase</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Link it on WhatsApp (for WhatsApp, SMS and call alerts) or Telegram to get notifications and chat with Observer.</p>
          </div>
          {code && (
            <span className={`inline-flex items-center gap-1 text-xs font-medium flex-shrink-0 ${verified ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>
              {verified ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
              {verified ? 'Connected' : 'Not connected'}
            </span>
          )}
        </div>

        {code ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              onClick={() => setRevealed(r => !r)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
              title={revealed ? 'Hide' : 'Reveal'}
            >
              <span className={`font-mono text-sm font-semibold text-gray-900 dark:text-gray-100 transition ${revealed ? '' : 'blur-sm select-none'}`}>{code}</span>
              {revealed ? <EyeOff className="h-4 w-4 text-gray-400" /> : <Eye className="h-4 w-4 text-gray-400" />}
            </button>
            <button onClick={copy} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800" aria-label="Copy phrase">
              {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
            </button>
            <button onClick={() => setShowQR(q => !q)} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800" aria-label="Show QR">
              <QrCode className="h-4 w-4" />
            </button>
            <button onClick={rotate} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800" aria-label="Generate new phrase">
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setCode(SensorSettings.ensureWhitelistCode())}
            className="mt-3 px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700"
          >
            Set up notifications
          </button>
        )}

        {code && showQR && (
          <div className="mt-4 flex flex-col items-center gap-4 rounded-xl bg-white border border-gray-200 py-4">
            <div className="inline-flex items-center gap-1 p-1 rounded-full bg-gray-100 border border-gray-200">
              {(['whatsapp', 'telegram'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setQrTab(t)}
                  className={`px-3 py-1 rounded-full text-xs font-medium capitalize transition-colors ${
                    qrTab === t ? 'bg-purple-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {t === 'whatsapp' ? 'WhatsApp' : 'Telegram'}
                </button>
              ))}
            </div>

            {qrTab === 'telegram' ? (
              <div className="flex flex-col items-center gap-3">
                <div className="bg-white p-3 rounded-xl border border-gray-200 shadow-sm">
                  <QRCodeSVG value={telegramCodeLink(code)} size={168} level="H" includeMargin={false} fgColor="#111827" />
                </div>
                <a
                  href={telegramCodeLink(code)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 text-white rounded text-xs font-medium hover:bg-black transition-colors"
                >
                  Open in Telegram <ExternalLink className="h-3 w-3" />
                </a>
                <p className="text-xs text-gray-500 text-center max-w-xs">
                  Scan or open, then tap <span className="font-medium">Start</span> in the chat with @{TELEGRAM_BOT} — this lets you message Observer from Telegram.
                </p>
              </div>
            ) : (
              <WhitelistQR code={code} />
            )}
          </div>
        )}

        <RemoteControlStatus hasCode={!!code} />
      </div>

      {KINDS.map(kind => <ContactRow key={kind} kind={kind} />)}
    </section>
  );
};

export default UserInfoCard;
