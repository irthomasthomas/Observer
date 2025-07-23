// components/AgentCard/AgentCardHeader.tsx
import React from 'react';
import { Play, Power, Zap } from 'lucide-react';

const AgentStatusPill: React.FC<{ isRunning: boolean; isStarting: boolean; hasQuotaError: boolean; }> = ({ isRunning, isStarting, hasQuotaError }) => {
  let text = 'Inactive', colorClasses = 'bg-gray-100 text-gray-800';
  if (hasQuotaError) { text = 'Limit Reached'; colorClasses = 'bg-red-100 text-red-700'; }
  else if (isStarting) { text = 'Starting'; colorClasses = 'bg-yellow-100 text-yellow-800 animate-pulse'; }
  else if (isRunning) { text = 'Active'; colorClasses = 'bg-green-100 text-green-800'; }
  const dotColor = hasQuotaError ? 'bg-red-500' : isStarting ? 'bg-yellow-500' : isRunning ? 'bg-green-500' : 'bg-gray-400';

  return (
    <div className={`px-3 py-1 text-xs font-medium rounded-full inline-flex items-center ${colorClasses}`}>
      <div className={`w-2 h-2 rounded-full mr-1.5 ${dotColor}`}></div>
      <span>{text}</span>
    </div>
  );
};

interface AgentCardHeaderProps {
    agentName: string;
    isRunning: boolean;
    isStarting: boolean;
    hasQuotaError: boolean;
    isLive: boolean;
    onToggle: () => void;
}

const AgentCardHeader: React.FC<AgentCardHeaderProps> = ({ agentName, isRunning, isStarting, hasQuotaError, isLive, onToggle }) => {
    return (
        <div className="flex justify-between items-center mb-4">
           <div className="flex-1 min-w-0">
             {!isLive && !hasQuotaError ? (
                <>
                  <h3 className="text-xl font-bold text-gray-800 truncate">{agentName}</h3>
                  <div className="mt-1">
                    <AgentStatusPill isRunning={isRunning} isStarting={isStarting} hasQuotaError={hasQuotaError} />
                  </div>
                </>
             ) : (
                <AgentStatusPill isRunning={isRunning} isStarting={isStarting} hasQuotaError={hasQuotaError} />
             )}
           </div>

           {(isLive || hasQuotaError) && (
             <h3 className="text-xl font-bold text-gray-800 truncate text-center flex-1 px-4">{agentName}</h3>
           )}

           <div className="flex-1 flex justify-end">
             <button
               onClick={onToggle}
               className={`px-4 py-2 rounded-lg font-medium flex-shrink-0 flex items-center transition-colors text-sm ${
                 hasQuotaError ? 'bg-red-100 text-red-700 cursor-not-allowed'
                   : isStarting ? 'bg-yellow-100 text-yellow-700 cursor-wait'
                   : isRunning ? 'bg-red-100 text-red-700 hover:bg-red-200'
                   : 'bg-green-100 text-green-700 hover:bg-green-200'
               }`}
               disabled={isStarting || hasQuotaError}
             >
               {hasQuotaError ? <><Zap className="w-4 h-4 mr-2" /> Limit</>
                   : isStarting ? 'Starting...'
                   : isRunning ? <><Power className="w-4 h-4 mr-2" /> Stop</>
                   : <><Play className="w-4 h-4 mr-2" /> Start</>}
             </button>
           </div>
        </div>
    );
};

export default AgentCardHeader;
