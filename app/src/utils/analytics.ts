import { datadogRum } from '@datadog/browser-rum';

// Thin wrapper so callers never import datadogRum directly.
// All funnel events go through here — easy to swap or extend later.
export function track(action: string, context?: Record<string, unknown>) {
  datadogRum.addAction(action, context);
}

// ── Startup dialog ────────────────────────────────────────────────────────────
export const Analytics = {
  startupShown: () => track('startup_dialog_shown'),
  startupSignIn: () => track('startup_sign_in_clicked'),
  startupSkip: () => track('startup_skip_clicked'),

  // ── Local mode warning ──────────────────────────────────────────────────────
  localModeShown: () => track('local_mode_warning_shown'),
  localModeSignIn: () => track('local_mode_sign_in_clicked'),
  localModeContinue: () => track('local_mode_continue_clicked'),

  // ── Upsell (shown in WelcomeModal right after ToS acceptance) ────────────────
  upsellShown: (source: 'welcome') => track('upsell_shown', { source }),
  upsellFreeTrial: (source: 'welcome') => track('upsell_free_trial_clicked', { source }),
  upsellGithub: (source: 'welcome') => track('upsell_github_clicked', { source }),
  upsellContinueFree: (source: 'welcome') => track('upsell_continue_free_clicked', { source }),
  upsellViewTiers: (source: 'welcome') => track('upsell_view_tiers_clicked', { source }),
};
