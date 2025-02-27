// src/utils/command_registry.ts
import { Logger } from './logging';

// Command registry to store all registered commands
const commandRegistry: Record<string, Record<string, Function>> = {};

export function registerCommand(agentId: string, commandName: string, handler: Function): void {
  if (!commandRegistry[agentId]) {
    commandRegistry[agentId] = {};
  }
  
  const normalizedName = commandName.trim().toUpperCase();
  commandRegistry[agentId][normalizedName] = handler;
  Logger.info(agentId, `Registered command: ${normalizedName}`);
}

export function getCommands(agentId: string): Record<string, Function> {
  return commandRegistry[agentId] || {};
}

export function clearCommands(agentId: string): void {
  delete commandRegistry[agentId];
  Logger.info(agentId, `Cleared all commands`);
}
