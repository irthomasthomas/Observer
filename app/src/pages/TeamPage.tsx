import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@contexts/AuthContext';
import { Loader2, UserPlus, Trash2, ArrowLeft, AlertCircle } from 'lucide-react';
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

export function TeamPage() {
  const { getAccessToken } = useAuth();
  const navigate = useNavigate();

  const [org, setOrg] = useState<Org | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

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
        setNotice(data.detail || 'Could not send that invite.');
        return;
      }
      setNotice(
        data.status === 'active'
          ? `${data.email} already had an Observer account and is active now.`
          : `Invite sent to ${data.email}.`
      );
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
      setNotice(data.detail || 'Could not remove that member.');
      return;
    }
    await load();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  if (error || !org) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50">
        <div className="p-10 bg-white rounded-2xl shadow-lg max-w-md w-full mx-4 text-center">
          <AlertCircle className="h-10 w-10 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 text-sm mb-6">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="px-5 py-2.5 bg-gray-100 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-200"
          >
            Go to Observer
          </button>
        </div>
      </div>
    );
  }

  const seatsLeft = org.seats_purchased - org.seats_used;

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-5xl mx-auto">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-6"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Observer
        </button>

        <div className="bg-white rounded-2xl shadow-sm p-6 mb-6">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{org.name}</h1>
              <p className="text-sm text-gray-500 mt-1">
                Observer {org.tier.charAt(0).toUpperCase() + org.tier.slice(1)} · {org.seats_used} of{' '}
                {org.seats_purchased} seats used
              </p>
            </div>
            {org.status !== 'active' && (
              <span className="px-3 py-1 rounded-full text-xs font-medium bg-yellow-50 text-yellow-700">
                Subscription {org.status}
              </span>
            )}
          </div>

          <div className="mt-4 h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all"
              style={{ width: `${Math.min(100, (org.seats_used / org.seats_purchased) * 100)}%` }}
            />
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-6 mb-6">
          <form onSubmit={invite} className="flex gap-3 flex-wrap">
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="teammate@company.com"
              disabled={seatsLeft <= 0}
              className="flex-1 min-w-[240px] px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
            />
            <button
              type="submit"
              disabled={inviting || seatsLeft <= 0}
              className="px-5 py-2.5 bg-blue-500 text-white text-sm font-medium rounded-xl hover:bg-blue-600 disabled:bg-gray-300 flex items-center gap-2"
            >
              {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              Invite
            </button>
          </form>
          {seatsLeft <= 0 && (
            <p className="text-xs text-gray-500 mt-3">
              All seats are in use. Contact Observer to add more.
            </p>
          )}
          {notice && <p className="text-sm text-gray-600 mt-3">{notice}</p>}
        </div>

        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Usage today</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                  <th className="px-6 py-3 font-medium">Member</th>
                  {SERVICES.map((s) => (
                    <th key={s} className="px-3 py-3 font-medium text-right">{SERVICE_LABELS[s]}</th>
                  ))}
                  {org.is_owner && <th className="px-6 py-3" />}
                </tr>
              </thead>
              <tbody>
                {org.members.map((m) => (
                  <tr key={m.email} className="border-b border-gray-50 last:border-0">
                    <td className="px-6 py-3">
                      <div className="text-gray-900">{m.email}</div>
                      <div className="text-xs text-gray-400">
                        {m.status === 'invited' ? 'Invite pending' : 'Active'}
                        {m.email === org.owner_email && ' · Owner'}
                      </div>
                    </td>
                    {SERVICES.map((s) => (
                      <td key={s} className="px-3 py-3 text-right tabular-nums text-gray-600">
                        {m.usage?.[s] ?? 0}
                      </td>
                    ))}
                    {org.is_owner && (
                      <td className="px-6 py-3 text-right">
                        {m.email !== org.owner_email && (
                          <button
                            onClick={() => remove(m.email)}
                            className="text-gray-400 hover:text-red-500"
                            title={`Remove ${m.email}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
