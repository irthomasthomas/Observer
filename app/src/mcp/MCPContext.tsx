// src/mcp/MCPContext.tsx
//
// App-level provider for the MCP conversation. Mounting the useMCP state HERE (once, high
// in the tree) instead of inside MCP.tsx gives us two things at once:
//   1. A single shared conversation — open the MCP UI from GetStarted or the modal and it's
//      the same wire/messages, so users keep their progress as they move around the app.
//   2. A stable home for the async agentic loop — the provider never unmounts, so a run
//      keeps updating state even if the user closes the modal mid-flight.
//
// MCP.tsx is a pure consumer via useMCPContext().

import React, { createContext, useContext } from 'react';
import type { TokenProvider } from '@utils/main_loop';
import { useMCP, type UseMCPReturn } from './useMCP';

const MCPContext = createContext<UseMCPReturn | null>(null);

interface MCPProviderProps {
  getToken: TokenProvider;
  isUsingObServer: boolean;
  children: React.ReactNode;
}

export const MCPProvider: React.FC<MCPProviderProps> = ({ getToken, isUsingObServer, children }) => {
  const mcp = useMCP({ getToken, isUsingObServer });
  return <MCPContext.Provider value={mcp}>{children}</MCPContext.Provider>;
};

export function useMCPContext(): UseMCPReturn {
  const ctx = useContext(MCPContext);
  if (!ctx) {
    throw new Error('useMCPContext must be used within an <MCPProvider>');
  }
  return ctx;
}
