import React from 'react';
import Modal from '@components/EditAgent/Modal';
import { Phone, X, CheckCircle, KeyRound, ChevronRight } from 'lucide-react';
import type { WhitelistChannel } from '@utils/logging';
import WhitelistInline from '@components/whitelist/WhitelistInline';
import { useWhitelistPolling } from '@components/whitelist/shared';
import { SensorSettings } from '@utils/settings';

interface WhitelistModalProps {
  phoneNumbers: Array<{
    number: string;
    isWhitelisted: boolean;
  }>;
  onClose: () => void;
  onStartAnyway?: () => void;
  onStartAgent?: () => void;
  getToken: () => Promise<string | undefined>;
  channel?: WhitelistChannel; // 'whatsapp' | 'sms' | 'voice'
}

const WhitelistModal: React.FC<WhitelistModalProps> = ({ phoneNumbers, onClose, onStartAnyway, onStartAgent, getToken, channel }) => {
  // Golden path: a stable, per-user 4-word code the user texts/WhatsApps to us instead of
  // typing a phone number. Falls back to typing a real number for edge cases (e.g. someone
  // else's phone should be whitelisted, not the current user's).
  const code = React.useMemo(() => SensorSettings.ensureWhitelistCode(), []);
  const [useFallback, setUseFallback] = React.useState(false);

  const { allWhitelisted: codeWhitelisted } = useWhitelistPolling(
    [{ number: code, isWhitelisted: false }],
    getToken,
    channel,
    !useFallback,
  );

  // Fallback: verify the specific number(s) the agent actually flagged.
  const { numbers: fallbackNumbers, status: fallbackStatus } = useWhitelistPolling(
    phoneNumbers,
    getToken,
    channel,
    useFallback,
  );

  const success = useFallback ? fallbackStatus === 'success' : codeWhitelisted;

  return (
    <Modal open={true} onClose={onClose} className="w-full max-w-lg md:max-w-2xl">
      {/* Header */}
      <div className="flex justify-between items-center p-6 border-b border-gray-200 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-t-lg">
        <div className="flex items-center space-x-3">
          <Phone className="h-6 w-6" />
          <div>
            <h2 className="text-xl font-semibold">Whitelist your Phone</h2>
            <p className="text-sm text-blue-100">30-second verification • Valid for 24 hours</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-full hover:bg-blue-700 hover:bg-opacity-50 text-blue-100 hover:text-white transition-colors"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Content */}
      <div className="p-6 space-y-4">
        {/* Success State - Clean and Minimal */}
        {success && onStartAgent ? (
          <div className="py-8">
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
                <CheckCircle className="h-8 w-8 text-green-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">All Set!</h2>
              <p className="text-gray-600">Your phone number is whitelisted and ready to go.</p>
            </div>
            <button
              onClick={() => {
                onStartAgent();
                onClose();
              }}
              className="w-full px-6 py-4 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold text-lg shadow-lg transition-colors"
            >
              Start Agent
            </button>
            <p className="text-xs text-gray-500 text-center mt-3">
              Whitelisted numbers are valid for 24 hours.
            </p>
          </div>
        ) : (
          <>
            {/* Title */}
            <div className="text-center">
              <h2 className="text-xl font-semibold text-gray-900 mb-1">You need to whitelist your phone!</h2>
              <p className="text-sm text-gray-600">
                {useFallback
                  ? 'Use any of these two options:'
                  : `Scan the QR or send this code to whitelist yourself for ${channel === 'whatsapp' ? 'WhatsApp' : 'SMS/calls'}:`}
              </p>
            </div>

            {!useFallback ? (
              <>
                <div className="flex items-center justify-center gap-2 py-1">
                  <KeyRound className="h-4 w-4 text-purple-600" />
                  <span className="font-mono text-sm font-semibold text-gray-900">{code}</span>
                </div>

                <WhitelistInline
                  phoneNumber={code}
                  channel={channel}
                  getToken={getToken}
                  mode="code"
                />

                <div className="text-center pt-2">
                  <button
                    onClick={() => setUseFallback(true)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors"
                  >
                    Or enter a phone number instead <ChevronRight className="h-3 w-3" />
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="text-center">
                  <button
                    onClick={() => setUseFallback(false)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors"
                  >
                    <ChevronRight className="h-3 w-3 rotate-180" /> Back to code
                  </button>
                </div>

                {fallbackNumbers.length > 0 ? (
                  fallbackNumbers.map(({ number }) => (
                    <WhitelistInline
                      key={number}
                      phoneNumber={number}
                      channel={channel}
                      getToken={getToken}
                      onWhitelisted={() => {}}
                    />
                  ))
                ) : (
                  <p className="text-sm text-orange-700">
                    ⚠️ Phone tools detected but no phone number found in your code. Make sure dynamic numbers are whitelisted.
                  </p>
                )}
              </>
            )}

            <p className="text-xs text-gray-500 pt-2">
              Whitelisted numbers are valid for 24 hours.
            </p>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="flex justify-end items-center px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-lg space-x-3">
        {success && onStartAgent ? (
          <button
            onClick={onClose}
            className="px-5 py-2 bg-gray-200 text-gray-700 rounded-md text-sm font-medium hover:bg-gray-300 transition-colors"
          >
            Close
          </button>
        ) : onStartAnyway ? (
          <>
            <button
              onClick={onClose}
              className="px-5 py-2 bg-gray-200 text-gray-700 rounded-md text-sm font-medium hover:bg-gray-300 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onStartAnyway}
              className="px-5 py-2 border-2 border-orange-500 text-orange-700 rounded-md text-sm font-medium hover:bg-orange-50 transition-colors"
            >
              ⚠️ Start Anyway (Will Fail)
            </button>
          </>
        ) : (
          <button
            onClick={onClose}
            className="px-5 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            Got it
          </button>
        )}
      </div>
    </Modal>
  );
};

export default WhitelistModal;
