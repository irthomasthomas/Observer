// src/components/PricingTable.tsx

import React, { useState, useCallback } from 'react';
import {
  Loader2, Zap, ExternalLink,
  Check, X, Server, Sparkles, RotateCcw
} from 'lucide-react';
import { isIOS } from '../utils/platform';
import { Logger } from '@utils/logging';
import type { UseApplePaymentsReturn } from '@hooks/useApplePayments';
import { openUrl } from '@tauri-apps/plugin-opener';

interface PricingTableProps {
  headline: string;
  subheadline: string;
  status: 'loading' | 'plus' | 'pro' | 'max' | 'free' | 'error';
  isButtonLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;
  onCheckout: () => void;
  onCheckoutPlus: () => void;
  onCheckoutMax: () => void;
  onManageSubscription: () => void;
  onLogin: () => void;
  isTriggeredByQuotaError?: boolean;
  isHalfwayWarning?: boolean;
  applePayments?: UseApplePaymentsReturn | null;
  onModalClose?: () => void;
}

interface FeatureRow {
  label: string;
  sparkle?: boolean;
  notLoggedIn: boolean | string;
  free: boolean | string;
  pro: boolean | string;
  max: boolean | string;
}

interface FeatureGroup {
  group: string;
  rows: FeatureRow[];
}

const featureGroups: FeatureGroup[] = [
  {
    group: 'Core Loop',
    rows: [
      { label: 'Local Monitoring 24/7',   notLoggedIn: true,  free: true,       pro: true,        max: true },
      { label: 'Logging & Recording',      notLoggedIn: true,  free: true,       pro: true,        max: true },
      { label: 'Discord Notifications',    notLoggedIn: true,  free: true,       pro: true,        max: true },
    ],
  },
  {
    group: 'Notifications',
    rows: [
      { label: 'Telegram, Email & Pushover', notLoggedIn: false, free: true,      pro: true,        max: true },
      { label: 'SMS, Phone & WhatsApp',      notLoggedIn: false, free: '5 / day', pro: 'Unlimited', max: 'Unlimited' },
    ],
  },
  {
    group: 'AI inference',
    rows: [
      { label: 'Alert Builder',            notLoggedIn: false, free: true,        pro: true,         max: true },
      { label: 'Cloud Monitoring',         notLoggedIn: false, free: '1 hr / day', pro: '8 hr / day', max: '24 / 7' },
      { label: 'AI Studio (Multi-Agent)',  sparkle: true, notLoggedIn: false, free: false, pro: true, max: true },
    ],
  },
  {
    group: 'Support',
    rows: [
      { label: 'Support', notLoggedIn: "We don't know you!", free: 'Limited', pro: 'Better', max: 'Priority' },
    ],
  },
];

const CheckMark = () => <Check className="h-5 w-5 text-green-500 mx-auto" />;
const CrossMark = () => <X className="h-5 w-5 text-gray-300 mx-auto" />;

const renderCell = (value: boolean | string) => {
  if (value === true)  return <CheckMark />;
  if (value === false) return <CrossMark />;
  return <span className="text-sm font-semibold text-gray-700 whitespace-nowrap">{value}</span>;
};

export const PricingTable: React.FC<PricingTableProps> = ({
  headline,
  subheadline,
  status,
  isButtonLoading,
  isAuthenticated,
  error,
  onCheckout,
  onCheckoutMax,
  onManageSubscription,
  onLogin,
  isTriggeredByQuotaError = false,
  applePayments,
  onModalClose,
}) => {
  const isAppleDevice = isIOS();
  const [internalLoading, setInternalLoading] = useState(false);

  // plus is a legacy tier — treat it as pro
  const effectiveStatus = status === 'plus' ? 'pro' : status;

  const handleApplePurchase = useCallback(async (tier: 'pro' | 'max') => {
    if (!applePayments) return;
    Logger.info('PRICING_TABLE', `Starting Apple purchase for tier: ${tier}`);
    setInternalLoading(true);
    try {
      const result = await applePayments.purchaseProduct(tier);
      Logger.info('PRICING_TABLE', 'Purchase result:', result);
      if (result.success) {
        if (onModalClose) onModalClose();
        window.location.href = '/upgrade-success';
      }
    } catch (err) {
      Logger.error('PRICING_TABLE', 'Purchase failed:', err);
    } finally {
      setInternalLoading(false);
    }
  }, [applePayments, onModalClose]);

  const handleAppleRestore = useCallback(async () => {
    if (!applePayments) return;
    Logger.info('PRICING_TABLE', 'Starting Apple restore');
    setInternalLoading(true);
    try {
      const result = await applePayments.restorePurchases();
      Logger.info('PRICING_TABLE', 'Restore result:', result);
      if (result.success) {
        if (onModalClose) onModalClose();
        window.location.href = '/upgrade-success';
      }
    } catch (err) {
      Logger.error('PRICING_TABLE', 'Restore failed:', err);
    } finally {
      setInternalLoading(false);
    }
  }, [applePayments, onModalClose]);

  const handleManageSubscription = isAppleDevice && applePayments
    ? () => openUrl('https://apps.apple.com/account/subscriptions')
        .catch((err: unknown) => Logger.error('PRICING_TABLE', 'openUrl failed:', err))
    : onManageSubscription;

  const handleProCheckout  = isAppleDevice && applePayments ? () => handleApplePurchase('pro')  : onCheckout;
  const handleMaxCheckout  = isAppleDevice && applePayments ? () => handleApplePurchase('max')  : onCheckoutMax;

  const combinedLoading = isButtonLoading || internalLoading || (applePayments?.isLoading ?? false);
  const combinedError   = error || (applePayments?.error ?? null);

  // ── table column helpers ──────────────────────────────────────────────────
  const headerBase = "text-center px-3 pt-3 pb-2 text-sm font-bold";
  const cellBase   = "text-center px-3 py-3";

  const getHeaderClass = (tier: 'free' | 'pro' | 'max') => {
    const current = effectiveStatus === tier;
    if (tier === 'pro') return `${headerBase} rounded-t-lg ${current ? 'bg-purple-600 text-white' : 'bg-purple-50 text-purple-900'}`;
    if (tier === 'max') return `${headerBase} rounded-t-lg ${current ? 'bg-amber-500  text-white' : 'bg-amber-50  text-amber-900'}`;
    return `${headerBase} bg-gray-50 text-gray-600`;
  };

  const getCellClass = (tier: 'notLoggedIn' | 'free' | 'pro' | 'max') => {
    const current = tier !== 'notLoggedIn' && effectiveStatus === tier;
    if (tier === 'pro') return `${cellBase} ${current ? 'bg-purple-50/60' : ''}`;
    if (tier === 'max') return `${cellBase} ${current ? 'bg-amber-50/60'  : ''}`;
    return cellBase;
  };

  const dataColCount = isAuthenticated ? 4 : 3; // label + data columns

  return (
    <div className="w-full max-w-4xl mx-auto p-4 sm:p-6 bg-white rounded-lg">

      {/* ── Header ── */}
      <div className="flex items-start gap-3 mb-6">
        <Zap className={`flex-shrink-0 mt-1 text-purple-500 ${isTriggeredByQuotaError ? 'h-10 w-10' : 'h-7 w-7'}`} />
        <div>
          <h1 className={`font-bold text-gray-800 tracking-tight ${isTriggeredByQuotaError ? 'text-2xl sm:text-3xl' : 'text-xl sm:text-2xl'}`}>
            {headline}
          </h1>
          <p className="text-sm sm:text-base text-gray-500 mt-1">{subheadline}</p>
          {isTriggeredByQuotaError && (
            <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
              <span>🚀 2k+ users</span>
              <span>•</span>
              <span>⭐ 1k+ GitHub stars</span>
              <span>•</span>
              <span>⚡ 100k+ captures/day</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Comparison Table ── */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm mb-6">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400 bg-gray-50 w-2/5">
                Features
              </th>
              {isAuthenticated ? (
                <>
                  <th className={getHeaderClass('free')}>
                    <div>Quick Start</div>
                    <div className="text-xs font-normal text-gray-400 mt-0.5">Free</div>
                  </th>
                  <th className={getHeaderClass('pro')}>
                    <div>Pro</div>
                    <div className={`text-xs font-normal mt-0.5 ${effectiveStatus === 'pro' ? 'text-purple-200' : 'text-purple-500'}`}>
                      ${isAppleDevice ? '22.99' : '20'} / mo
                    </div>
                  </th>
                  <th className={getHeaderClass('max')}>
                    <div>Max</div>
                    <div className={`text-xs font-normal mt-0.5 ${effectiveStatus === 'max' ? 'text-amber-100' : 'text-amber-500'}`}>
                      ${isAppleDevice ? '99.99' : '80'} / mo
                    </div>
                  </th>
                </>
              ) : (
                <>
                  <th className={`${headerBase} bg-gray-50 text-gray-500`}>Not Logged In</th>
                  <th className={`${headerBase} bg-purple-50 text-purple-900 rounded-t-lg`}>
                    <div>Quick Start</div>
                    <div className="text-xs font-normal text-purple-500 mt-0.5">Free</div>
                  </th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {featureGroups.map((group) => (
              <React.Fragment key={group.group}>
                {/* Group header row */}
                <tr className="bg-gray-50/80">
                  <td colSpan={dataColCount} className="px-4 py-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-gray-400">
                      {group.group}
                    </span>
                  </td>
                </tr>
                {/* Feature rows */}
                {group.rows.filter(row => isAuthenticated || !row.sparkle).map((row, i) => (
                  <tr key={row.label} className={`border-t border-gray-100 ${row.sparkle ? 'bg-purple-200/60' : i % 2 === 1 ? 'bg-gray-50/30' : ''}`}>
                    <td className="px-4 py-3 text-sm font-medium">
                      {row.sparkle ? (
                        <span className="inline-flex items-center gap-1.5 text-gray-700 font-medium">
                          {row.label}
                          <Sparkles className="h-4 w-4 text-purple-500 flex-shrink-0" />
                        </span>
                      ) : (
                        <span className="text-gray-700">{row.label}</span>
                      )}
                    </td>
                    {isAuthenticated ? (
                      <>
                        <td className={getCellClass('free')}>{renderCell(row.free)}</td>
                        <td className={getCellClass('pro')}>{renderCell(row.pro)}</td>
                        <td className={getCellClass('max')}>{renderCell(row.max)}</td>
                      </>
                    ) : (
                      <>
                        <td className={getCellClass('notLoggedIn')}>{renderCell(row.notLoggedIn)}</td>
                        <td className={getCellClass('free')}>{renderCell(row.free)}</td>
                      </>
                    )}
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Plan Cards / CTA ── */}
      {isAuthenticated ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

          {/* Free Card */}
          <div className={`rounded-xl border-2 p-4 flex flex-col gap-3 transition-colors ${
            effectiveStatus === 'free' ? 'border-gray-400 bg-gray-50' : 'border-gray-200 bg-white'
          }`}>
            <div className="flex items-center gap-2">
              <Server className="h-5 w-5 text-gray-500" />
              <span className="font-bold text-gray-800">Quick Start</span>
              {effectiveStatus === 'free' && (
                <span className="ml-auto text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full font-medium">Current</span>
              )}
            </div>
            <p className="text-2xl font-bold text-gray-900">
              $0<span className="text-sm font-normal text-gray-400"> / mo</span>
            </p>
            <button disabled className="w-full py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-400 bg-gray-100 cursor-not-allowed">
              Free Forever
            </button>
          </div>

          {/* Pro Card */}
          <div className={`rounded-xl border-2 p-4 flex flex-col gap-3 transition-colors ${
            effectiveStatus === 'pro' ? 'border-purple-500 bg-purple-50' : 'border-purple-200 bg-white'
          }`}>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-500" />
              <span className="font-bold text-purple-900">Pro</span>
              {effectiveStatus === 'pro' && (
                <span className="ml-auto text-xs bg-purple-200 text-purple-700 px-2 py-0.5 rounded-full font-medium">Current</span>
              )}
            </div>
            <p className="text-2xl font-bold text-purple-900">
              ${isAppleDevice ? '22.99' : '20'}<span className="text-sm font-normal text-purple-400"> / mo</span>
            </p>
            {effectiveStatus === 'pro' ? (
              <button
                onClick={handleManageSubscription}
                disabled={combinedLoading}
                className="w-full py-2 rounded-lg border border-purple-200 text-sm font-medium text-purple-700 bg-purple-100 hover:bg-purple-200 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {combinedLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
                Manage Subscription
              </button>
            ) : (
              <button
                onClick={handleProCheckout}
                disabled={combinedLoading}
                className="w-full py-2 rounded-lg text-sm font-bold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {combinedLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                Start Free Trial
              </button>
            )}
          </div>

          {/* Max Card */}
          <div className={`rounded-xl border-2 p-4 flex flex-col gap-3 transition-colors ${
            effectiveStatus === 'max' ? 'border-amber-500 bg-amber-50' : 'border-amber-200 bg-white'
          }`}>
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-amber-500" />
              <span className="font-bold text-amber-900">Max</span>
              {effectiveStatus === 'max' && (
                <span className="ml-auto text-xs bg-amber-200 text-amber-700 px-2 py-0.5 rounded-full font-medium">Current</span>
              )}
            </div>
            <p className="text-2xl font-bold text-amber-900">
              ${isAppleDevice ? '99.99' : '80'}<span className="text-sm font-normal text-amber-400"> / mo</span>
            </p>
            {effectiveStatus === 'max' ? (
              <button
                onClick={handleManageSubscription}
                disabled={combinedLoading}
                className="w-full py-2 rounded-lg border border-amber-200 text-sm font-medium text-amber-700 bg-amber-100 hover:bg-amber-200 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {combinedLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
                Manage Subscription
              </button>
            ) : (
              <button
                onClick={handleMaxCheckout}
                disabled={combinedLoading}
                className="w-full py-2 rounded-lg text-sm font-bold text-white bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-md"
              >
                {combinedLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                Upgrade to Max
              </button>
            )}
          </div>

        </div>
      ) : (
        /* Not authenticated: sign-up CTA */
        <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-xl p-6 text-center border border-purple-100">
          <p className="text-gray-700 font-medium mb-1">
            Log in to unlock cloud monitoring, alert builder & more
          </p>
          <button
            onClick={onLogin}
            className="inline-flex items-center px-8 py-3 rounded-lg text-base font-bold text-white bg-purple-600 hover:bg-purple-700 transition-colors shadow-md"
          >
            Get Started
          </button>
        </div>
      )}

      {/* ── Error ── */}
      {combinedError && (
        <div className="text-center mt-4">
          <p className="text-sm text-red-600 font-semibold">{combinedError}</p>
        </div>
      )}

      {/* ── iOS: Restore & Load Products ── */}
      {isAppleDevice && applePayments && isAuthenticated && (
        <div className="text-center mt-4 flex justify-center gap-4">
          {applePayments.loadProducts && (
            <button
              onClick={applePayments.loadProducts}
              disabled={combinedLoading}
              className="inline-flex items-center text-sm text-blue-600 hover:text-blue-800 disabled:text-gray-300 font-medium"
            >
              <Sparkles className="h-4 w-4 mr-1" />
              Load Products
            </button>
          )}
          <button
            onClick={handleAppleRestore}
            disabled={combinedLoading}
            className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 disabled:text-gray-300"
          >
            <RotateCcw className="h-4 w-4 mr-1" />
            Restore Purchases
          </button>
        </div>
      )}

      {/* ── Terms (required for App Store) ── */}
      <div className="text-center mt-6 pt-4 border-t border-gray-100">
        <p className="text-xs text-gray-400">
          By subscribing, you agree to our{' '}
          {isIOS() ? (
            <>
              <button onClick={() => openUrl('https://observer-ai.com/#/Terms')} className="text-blue-500 hover:text-blue-700 underline">
                Terms of Service
              </button>
              {' '}and{' '}
              <button onClick={() => openUrl('https://observer-ai.com/#/Privacy')} className="text-blue-500 hover:text-blue-700 underline">
                Privacy Policy
              </button>
            </>
          ) : (
            <>
              <a href="https://observer-ai.com/#/Terms" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700 underline">Terms of Service</a>
              {' '}and{' '}
              <a href="https://observer-ai.com/#/Privacy" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700 underline">Privacy Policy</a>
            </>
          )}
          .
        </p>
      </div>
    </div>
  );
};
