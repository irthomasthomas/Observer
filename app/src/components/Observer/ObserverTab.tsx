// src/components/Observer/ObserverTab.tsx
//
// Top-level "Observer" tab — the app's default landing view. A minimal ChatGPT/Claude
// Cowork-style splash (ObserverHero) until the first message is sent, then docks into a
// normal scrolling transcript with the input pinned to the bottom (MCP, unboxed). A strip
// of currently running agents overlays both states so a user never has to open the My
// Agents grid just to see what's active.
//
// The My Agents tab (grid, GetStarted, MCPPanel, minimize system) is untouched by this file.

import React from 'react';
import type { TokenProvider } from '@utils/main_loop';
import type { CompleteAgent } from '@utils/agent_database';
import { useMCPContext } from '../../mcp/MCPContext';
import MCP from '@components/AICreator/MCP';
import ObserverHero from './ObserverHero';
import RunningAgentsStrip from './RunningAgentsStrip';

interface ObserverTabProps {
  getToken: TokenProvider;
  isAuthenticated: boolean;
  isUsingObServer: boolean;
  onSignIn?: () => void;
  onSwitchToObServer?: () => void;
  onUpgrade?: () => void;
  onRefresh?: () => void;
  agents: CompleteAgent[];
  runningAgents: Set<string>;
  startingAgents: Set<string>;
  onToggleAgent: (agentId: string, isCurrentlyRunning: boolean) => void;
  onOpenMicroAgents?: () => void;
}

const ObserverTab: React.FC<ObserverTabProps> = ({
  getToken,
  isAuthenticated,
  isUsingObServer,
  onSignIn,
  onSwitchToObServer,
  onUpgrade,
  onRefresh,
  agents,
  runningAgents,
  startingAgents,
  onToggleAgent,
  onOpenMicroAgents,
}) => {
  const { messages, isRunning } = useMCPContext();
  const isEmpty = messages.length === 0 && !isRunning;

  return (
    <div className="flex flex-col h-full">
      <RunningAgentsStrip
        agents={agents}
        runningAgents={runningAgents}
        startingAgents={startingAgents}
        onToggle={onToggleAgent}
        onSelectAgent={onOpenMicroAgents}
      />
      {isEmpty ? (
        <ObserverHero />
      ) : (
        <div className="flex-1 min-h-0">
          <MCP
            boxed={false}
            heightClass="h-full"
            getToken={getToken}
            isAuthenticated={isAuthenticated}
            isUsingObServer={isUsingObServer}
            onSignIn={onSignIn}
            onSwitchToObServer={onSwitchToObServer}
            onUpgrade={onUpgrade}
            onRefresh={onRefresh}
          />
        </div>
      )}
    </div>
  );
};

export default ObserverTab;
