export interface GenerateCodeResponse {
  code: string;
  partner: string;
  discount: number | null;
  expires_in_days: number;
  message: string;
}

export interface ProvisionOrgResponse {
  org_id: string;
  owner_email: string;
  seats: number;
  tier: string;
  stripe_customer_id: string;
  stripe_subscription_id: string;
  invoice_id: string | null;
  hosted_invoice_url: string | null;
  owner_status: 'active' | 'invited';
  team_url: string;
  dry_run?: boolean;
}

export interface OrgMember {
  email: string;
  auth0_user_id: string | null;
  status: 'invited' | 'active' | 'removed';
  invited_at: string | null;
  joined_at: string | null;
  removed_at?: string | null;
  usage?: Record<string, number>;
}

export interface OrgRecord {
  org_id: string;
  name: string;
  owner_email: string;
  tier: string;
  status: string;
  seats_purchased: number;
  seats_used: number;
  stripe_customer_id: string;
  stripe_subscription_id: string;
  features: Record<string, unknown>;
  members: OrgMember[];
  created_at: string;
}

// Mirrors DASHBOARD_SERVICES in api/orgs.py
export const USAGE_SERVICES = [
  'monitor',
  'agent_creator',
  'email',
  'sms',
  'whatsapp',
  'telegram',
  'discord',
  'slack',
] as const;

export const USAGE_LABELS: Record<string, string> = {
  monitor: 'Monitor',
  agent_creator: 'Creator',
  email: 'Email',
  sms: 'SMS',
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
  discord: 'Discord',
  slack: 'Slack',
};
