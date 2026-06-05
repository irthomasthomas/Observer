import { useEffect, useState } from 'react';
import { KeyRound, Ticket, Copy, Check, ArrowRight, Loader2, AlertCircle } from 'lucide-react';
import { GenerateCodeResponse } from './types';

const API_URL = 'https://api.observer-ai.com/payments/partner/generate-code';

function App() {
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateCodeResponse | null>(null);
  const [copied, setCopied] = useState(false);

  const generateCode = async () => {
    if (!apiKey.trim() || loading) return;

    setLoading(true);
    setError(null);
    setResult(null);
    setCopied(false);

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'X-Partner-Key': apiKey.trim(),
        },
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new Error('Invalid API key. Please check your key and try again.');
        }
        throw new Error(`Request failed (${response.status}). Please try again.`);
      }

      const json: GenerateCodeResponse = await response.json();
      setResult(json);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Something went wrong. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  const copyCode = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.code);
      setCopied(true);
    } catch {
      setError('Could not copy to clipboard.');
    }
  };

  // Reset the "Copied!" confirmation after a moment.
  useEffect(() => {
    if (!copied) return;
    const timeout = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timeout);
  }, [copied]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-12">
      {/* Soft background accents */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-blue-100/50 blur-3xl" />
        <div className="absolute -bottom-32 -left-24 w-96 h-96 rounded-full bg-indigo-100/40 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white shadow-sm border border-gray-100 mb-5">
            <img src="/eye-logo-black.svg" alt="Observer AI" className="w-9 h-9" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
            Partner Dashboard
          </h1>
          <p className="mt-2 text-gray-500 text-sm leading-relaxed max-w-xs mx-auto">
            Generate a single-use discount code to share with your lead.
          </p>
        </div>

        {/* Card */}
        <div className="bg-white border border-gray-100 rounded-3xl shadow-xl shadow-gray-200/60 p-7">
          <label
            htmlFor="api-key"
            className="block text-sm font-semibold text-gray-700 mb-2"
          >
            API Key
          </label>
          <div className="relative">
            <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              id="api-key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && generateCode()}
              placeholder="Enter your API key"
              autoComplete="off"
              className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-10 pr-4 py-3 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 focus:bg-white transition"
            />
          </div>

          <button
            onClick={generateCode}
            disabled={loading || !apiKey.trim()}
            className="mt-4 w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed text-white font-semibold rounded-xl px-4 py-3 transition-all duration-200 flex items-center justify-center gap-2 shadow-sm shadow-blue-600/20 disabled:shadow-none"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                Generate Discount Code
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          {/* Error */}
          {error && (
            <div className="mt-4 flex items-start gap-2.5 bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-700">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Result */}
          {result && (
            <div className="mt-6 pt-6 border-t border-gray-100">
              <div className="flex items-center gap-2 mb-3">
                <Ticket className="w-4 h-4 text-blue-600" />
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Discount Code
                </p>
              </div>
              <div className="flex items-stretch gap-2">
                <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 rounded-xl px-4 py-3.5">
                  <code className="text-2xl font-mono font-bold tracking-[0.2em] text-blue-700">
                    {result.code}
                  </code>
                </div>
                <button
                  onClick={copyCode}
                  title="Copy code"
                  className={`shrink-0 w-14 rounded-xl border flex items-center justify-center transition-all duration-200 ${
                    copied
                      ? 'bg-green-50 border-green-200 text-green-600'
                      : 'bg-white border-gray-200 text-gray-500 hover:border-blue-300 hover:text-blue-600'
                  }`}
                >
                  {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                </button>
              </div>

              <p className="mt-4 text-sm text-gray-600 leading-relaxed">
                {result.message}
              </p>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="bg-gray-50 rounded-xl px-3 py-2.5">
                  <p className="text-[11px] uppercase tracking-wide text-gray-400 font-medium">
                    Partner
                  </p>
                  <p className="text-sm font-semibold text-gray-800 capitalize truncate">
                    {result.partner}
                  </p>
                </div>
                <div className="bg-gray-50 rounded-xl px-3 py-2.5">
                  <p className="text-[11px] uppercase tracking-wide text-gray-400 font-medium">
                    {result.discount != null ? 'Discount' : 'Expires in'}
                  </p>
                  <p className="text-sm font-semibold text-gray-800">
                    {result.discount != null
                      ? result.discount
                      : `${result.expires_in_days} days`}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          Observer AI · Partner Program
        </p>
      </div>
    </div>
  );
}

export default App;
