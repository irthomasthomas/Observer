import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@contexts/AuthContext';
import { Loader2, UserPlus, Trash2, ArrowLeft, AlertCircle, Users, Building2, CheckCircle2 } from 'lucide-react';
import { Logger } from '@utils/logging';

const API = 'https://api.observer-ai.com';

// Mirrors DASHBOARD_SERVICES in api/orgs.py
const SERVICES = ['monitor', 'agent_creator', 'email', 'sms', 'whatsapp', 'telegram', 'discord', 'slack'] as const;

const SERVICE_LABELS: Record<string, string> = {
  monitor: 'Monitor',
  agent_creator: 'Creator',
  email: 'Email',
  sms: 'SMS',
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
  discord: 'Discord',
  slack: 'Slack',
};

interface Member {
  email: string;
  status: 'invited' | 'active';
  joined_at: string | null;
  usage: Record<string, number>;
}

interface Org {
  org_id: string;
  name: string;
  tier: string;
  status: string;
  seats_purchased: number;
  seats_used: number;
  is_owner: boolean;
  owner_email: string;
  members: Member[];
}

const StatCard = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
  <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-5 py-4">
    <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">{label}</div>
    <div className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">{value}</div>
    {sub && <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{sub}</div>}
  </div>
);

export function TeamPage() {
  const { getAccessToken } = useAuth();
  const navigate = useNavigate();

  const [org, setOrg] = useState<Org | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const token = await getAccessToken();
      const res = await fetch(`${API}/orgs/me`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.detail || 'Could not load your organization.');
        return;
      }
      setOrg(await res.json());
      setError(null);
    } catch (e) {
      Logger.error('TEAM', 'Failed to load org', { error: e });
      setError('Could not reach the server.');
    } finally {
      setLoading(false);
    }
  }, [getAccessToken]);

  useEffect(() => { load(); }, [load]);

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setNotice(null);
    try {
      const token = await getAccessToken();
      const res = await fetch(`${API}/orgs/members`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice({ kind: 'error', text: data.detail || 'Could not send that invite.' });
        return;
      }
      setNotice({
        kind: 'success',
        text: data.status === 'active'
          ? `${data.email} already had an Observer account and is active now.`
          : `Invite sent to ${data.email}.`,
      });
      setInviteEmail('');
      await load();
    } finally {
      setInviting(false);
    }
  };

  const remove = async (email: string) => {
    if (!confirm(`Remove ${email} from the team? They will lose access immediately.`)) return;
    const token = await getAccessToken();
    const res = await fetch(`${API}/orgs/members`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setNotice({ kind: 'error', text: data.detail || 'Could not remove that member.' });
      return;
    }
    await load();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
        <Loader2 className="h-8 w-8 text-purple-500 animate-spin" />
      </div>
    );
  }

  if (error || !org) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900 px-4">
        <div className="p-10 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 max-w-md w-full text-center">
          <AlertCircle className="h-10 w-10 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-300 text-sm mb-6">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="px-5 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-sm font-medium rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            Go to Observer
          </button>
        </div>
      </div>
    );
  }

  const seatsLeft = org.seats_purchased - org.seats_used;
  const seatPct = org.seats_purchased > 0
    ? Math.min(100, (org.seats_used / org.seats_purchased) * 100)
    : 0;
  const activeCount = org.members.filter((m) => m.status === 'active').length;
  const pendingCount = org.members.length - activeCount;
  const tierLabel = org.tier.charAt(0).toUpperCase() + org.tier.slice(1);
  const monitorToday = org.members.reduce((sum, m) => sum + (m.usage?.monitor ?? 0), 0);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 md:py-12 px-4">
      <div className="max-w-6xl mx-auto">
        <button
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 mb-6 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Observer
        </button>

        {/* ── Org header ── */}
        <div className="flex items-start gap-4 flex-wrap mb-6">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-purple-100 dark:bg-purple-900/40">
            <Building2 className="h-6 w-6 text-purple-600 dark:text-purple-300" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">{org.name}</h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-200">
                Observer {tierLabel}
              </span>
              {org.status !== 'active' && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                  Subscription {org.status}
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Managed by {org.owner_email}
              {org.is_owner && ' · you'}
            </p>
          </div>
        </div>

        {/* ── Stats ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <StatCard
            label="Seats"
            value={`${org.seats_used} / ${org.seats_purchased}`}
            sub={seatsLeft > 0 ? `${seatsLeft} available` : 'All seats in use'}
          />
          <StatCard
            label="Members"
            value={String(activeCount)}
            sub={pendingCount > 0 ? `${pendingCount} invite${pendingCount === 1 ? '' : 's'} pending` : 'All invites accepted'}
          />
          <StatCard
            label="Monitor credits today"
            value={monitorToday.toLocaleString()}
            sub="Across the whole team"
          />
        </div>

        {/* ── Seat usage bar ── */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-5 py-4 mb-6">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="font-medium text-gray-700 dark:text-gray-300">Seat usage</span>
            <span className="text-gray-500 dark:text-gray-400 tabular-nums">{Math.round(seatPct)}%</span>
          </div>
          <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${seatsLeft <= 0 ? 'bg-amber-500' : 'bg-purple-500'}`}
              style={{ width: `${seatPct}%` }}
            />
          </div>
        </div>

        {/* ── Invite (owners only) ── */}
        {org.is_owner && (
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 md:p-6 mb-6">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">Invite a teammate</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 mb-4">
              They'll get an email with a link to claim a seat. Seats activate as soon as they sign in.
            </p>
            <form onSubmit={invite} className="flex gap-3 flex-wrap">
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="teammate@company.com"
                disabled={seatsLeft <= 0}
                className="flex-1 min-w-[240px] px-4 py-2.5 border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:bg-gray-50 dark:disabled:bg-gray-800 disabled:cursor-not-allowed transition-shadow"
              />
              <button
                type="submit"
                disabled={inviting || seatsLeft <= 0}
                className="px-5 py-2.5 bg-purple-600 text-white text-sm font-semibold rounded-xl hover:bg-purple-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed flex items-center gap-2 transition-colors shadow-sm"
              >
                {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                Send invite
              </button>
            </form>
            {seatsLeft <= 0 && (
              <p className="text-xs text-amber-700 dark:text-amber-300 mt-3">
                All seats are in use. Contact Observer to add more.
              </p>
            )}
            {notice && (
              <div
                className={`mt-4 flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm ${
                  notice.kind === 'success'
                    ? 'bg-green-50 text-green-800 dark:bg-green-900/30 dark:text-green-200'
                    : 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-200'
                }`}
              >
                {notice.kind === 'success'
                  ? <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  : <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />}
                <span>{notice.text}</span>
              </div>
            )}
          </div>
        )}

        {/* ── Members & usage ── */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
          <div className="px-5 md:px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-gray-400" />
              <h2 className="font-semibold text-gray-900 dark:text-gray-100">Members</h2>
            </div>
            <span className="text-xs text-gray-400 dark:text-gray-500">Usage resets daily at 00:00 UTC</span>
          </div>

          {org.members.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <Users className="h-8 w-8 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No one on the team yet.{org.is_owner && ' Invite your first teammate above.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-900/50 border-b border-gray-100 dark:border-gray-700">
                    <th className="px-5 md:px-6 py-3 font-semibold">Member</th>
                    {SERVICES.map((s) => (
                      <th key={s} className="px-3 py-3 font-semibold text-right whitespace-nowrap">{SERVICE_LABELS[s]}</th>
                    ))}
                    {org.is_owner && <th className="px-5 md:px-6 py-3" />}
                  </tr>
                </thead>
                <tbody>
                  {org.members.map((m) => {
                    const isOwner = m.email === org.owner_email;
                    return (
                      <tr
                        key={m.email}
                        className="border-b border-gray-50 dark:border-gray-700/50 last:border-0 hover:bg-gray-50/70 dark:hover:bg-gray-900/30 transition-colors"
                      >
                        <td className="px-5 md:px-6 py-3">
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700 text-xs font-bold uppercase text-gray-600 dark:text-gray-300">
                              {m.email.charAt(0)}
                            </div>
                            <div className="min-w-0">
                              <div className="text-gray-900 dark:text-gray-100 font-medium truncate">{m.email}</div>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${
                                    m.status === 'active'
                                      ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                                      : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                                  }`}
                                >
                                  {m.status === 'active' ? 'Active' : 'Pending'}
                                </span>
                                {isOwner && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
                                    Owner
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                        {SERVICES.map((s) => {
                          const n = m.usage?.[s] ?? 0;
                          return (
                            <td
                              key={s}
                              className={`px-3 py-3 text-right tabular-nums ${
                                n > 0 ? 'text-gray-700 dark:text-gray-200 font-medium' : 'text-gray-300 dark:text-gray-600'
                              }`}
                            >
                              {n > 0 ? n.toLocaleString() : '—'}
                            </td>
                          );
                        })}
                        {org.is_owner && (
                          <td className="px-5 md:px-6 py-3 text-right">
                            {!isOwner && (
                              <button
                                onClick={() => remove(m.email)}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                                title={`Remove ${m.email}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
