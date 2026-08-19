// src/utils/contactInfo.ts
//
// Validation + user-facing copy for the contact values Observer's notification tools need
// (sendSms/call/sendWhatsapp, sendEmail, sendTelegram, sendDiscord, sendPushover).
//
// Lives here rather than in a component so the `ask_user_info` modal and any other collector
// share one definition of "is this value usable" — previously this logic was inline in
// RecipeSplash and duplicated as prose in SimpleCreatorModal.

import type { UserInfoKind } from '../mcp/types';

/** The Telegram bot users message to obtain their chat_id. */
export const TELEGRAM_BOT = 'observer_notification_bot';
export const TELEGRAM_BOT_URL = `https://t.me/${TELEGRAM_BOT}`;

export const CONTACT_PLACEHOLDER: Record<UserInfoKind, string> = {
  phone: '+1 555 123 4567',
  email: 'you@email.com',
  telegram: '847392011',
  discord: 'https://discord.com/api/webhooks/…',
  pushover: 'Your Pushover user key',
};

export const CONTACT_LABEL: Record<UserInfoKind, string> = {
  phone: 'Your phone number',
  email: 'Your email address',
  telegram: 'Your Telegram chat ID',
  discord: 'Discord webhook URL',
  pushover: 'Pushover user key',
};

/** Whether a value is complete enough to hand to the notification tool. */
export function contactValid(kind: UserInfoKind, value: string): boolean {
  const v = value.trim();
  switch (kind) {
    case 'phone': return /^\+?[0-9][0-9\s()-]{6,}$/.test(v);
    case 'email': return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);
    // Telegram chat_ids are numeric and may be negative (groups/channels).
    case 'telegram': return /^-?[0-9]{5,}$/.test(v);
    case 'discord': return /^https?:\/\/(canary\.|ptb\.)?discord(app)?\.com\/api\/webhooks\/.+/.test(v);
    case 'pushover': return v.length >= 20;
  }
}

/** Why a value was rejected, for inline feedback. Null when valid or still empty. */
export function contactError(kind: UserInfoKind, value: string): string | null {
  const v = value.trim();
  if (!v || contactValid(kind, v)) return null;
  switch (kind) {
    case 'phone': return 'Include the country code, e.g. +1 555 123 4567.';
    case 'email': return "That doesn't look like an email address.";
    case 'telegram': return 'A chat ID is all digits — the bot replies with it after you send /start.';
    case 'discord': return 'Paste the full webhook URL starting with https://discord.com/api/webhooks/';
    case 'pushover': return 'Pushover user keys are 30 characters.';
  }
}

/** Normalize before handing to the model / persisting. */
export function normalizeContact(kind: UserInfoKind, value: string): string {
  const v = value.trim();
  if (kind === 'phone') {
    const digits = v.replace(/[^\d+]/g, '');
    return digits.startsWith('+') ? digits : `+${digits}`;
  }
  return v;
}
