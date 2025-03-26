import React, { useState, useEffect } from 'react';
import { Calendar, Clock } from 'lucide-react';
import { Logger } from '../utils/logging';
import { executeAgentIteration } from '../utils/main_loop';
import { updateAgentStatus } from '../utils/agent_database';

interface ScheduleAgentModalProps {
  agentId: string;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: () => void;
}

// Store scheduled tasks in memory
const scheduledAgents: Record<string, { 
  scheduledTime: Date; 
  timeoutId: number;
}> = {};

export const isAgentScheduled = (agentId: string): boolean => {
  return !!scheduledAgents[agentId];
}

export const getScheduledTime = (agentId: string): Date | null => {
  return scheduledAgents[agentId]?.scheduledTime || null;
}

export const cancelScheduledAgent = (agentId: string): void => {
  if (scheduledAgents[agentId]) {
    window.clearTimeout(scheduledAgents[agentId].timeoutId);
    delete scheduledAgents[agentId];
    Logger.info('SCHEDULE', `Cancelled scheduled run for agent ${agentId}`);
  }
}

const ScheduleAgentModal: React.FC<ScheduleAgentModalProps> = ({ 
  agentId, 
  isOpen, 
  onClose,
  onUpdate 
}) => {
  const [date, setDate] = useState<string>('');
  const [time, setTime] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isCurrentlyScheduled, setIsCurrentlyScheduled] = useState<boolean>(false);
  const [scheduledDateTime, setScheduledDateTime] = useState<string | null>(null);
  const [isOneTime, setIsOneTime] = useState<boolean>(true);  // Default to one-time execution

  // Set default date to today and time to next hour
  useEffect(() => {
    const now = new Date();
    const nextHour = new Date(now);
    nextHour.setHours(nextHour.getHours() + 1);
    nextHour.setMinutes(0);
    nextHour.setSeconds(0);
    
    const formattedDate = now.toISOString().split('T')[0];
    setDate(formattedDate);
    
    const hours = nextHour.getHours().toString().padStart(2, '0');
    const minutes = nextHour.getMinutes().toString().padStart(2, '0');
    setTime(`${hours}:${minutes}`);

    // Check if already scheduled
    if (isAgentScheduled(agentId)) {
      setIsCurrentlyScheduled(true);
      const scheduledTime = getScheduledTime(agentId);
      if (scheduledTime) {
        const formattedDateTime = new Intl.DateTimeFormat('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        }).format(scheduledTime);
        setScheduledDateTime(formattedDateTime);
      }
    }
  }, [agentId]);

  const handleSchedule = () => {
    try {
      setError(null);
      
      if (!date || !time) {
        setError('Please select both date and time');
        return;
      }
      
      const scheduledDateTime = new Date(`${date}T${time}`);
      const now = new Date();
      
      if (scheduledDateTime <= now) {
        setError('Scheduled time must be in the future');
        return;
      }
      
      const timeUntilExecution = scheduledDateTime.getTime() - now.getTime();
      
      cancelScheduledAgent(agentId);
      
      const timeoutId = window.setTimeout(async () => {
        Logger.info('SCHEDULE', `Executing scheduled run for agent ${agentId}`);
        
        try {
          if (isOneTime) {
            // For one-time execution, just run the agent iteration once
            await executeAgentIteration(agentId);
            Logger.info('SCHEDULE', `One-time execution completed for agent ${agentId}`);
          } else {
            // For continuous execution, start the agent loop
            const { startAgentLoop } = await import('../utils/main_loop');
            await startAgentLoop(agentId);
            await updateAgentStatus(agentId, 'running');
            Logger.info('SCHEDULE', `Started continuous execution for agent ${agentId}`);
          }
          
          // Clean up one-time schedule
          if (isOneTime) {
            delete scheduledAgents[agentId];
          }
          
          onUpdate();
        } catch (err) {
          Logger.error('SCHEDULE', `Failed to execute scheduled agent ${agentId}: ${(err as Error).message}`, err);
        }
      }, timeUntilExecution);
      
      scheduledAgents[agentId] = {
        scheduledTime: scheduledDateTime,
        timeoutId: timeoutId as unknown as number
      };
      
      Logger.info('SCHEDULE', `Agent ${agentId} scheduled to run at ${scheduledDateTime.toLocaleString()} (${isOneTime ? 'one-time' : 'continuous'})`);
      
      onUpdate();
      onClose();
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to schedule agent: ${errorMessage}`);
      Logger.error('SCHEDULE', `Failed to schedule agent ${agentId}: ${errorMessage}`, err);
    }
  };

  const handleCancel = () => {
    cancelScheduledAgent(agentId);
    setIsCurrentlyScheduled(false);
    setScheduledDateTime(null);
    onUpdate();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-96 max-w-md">
        <h2 className="text-xl font-semibold mb-4">Schedule Agent Run</h2>
        
        {isCurrentlyScheduled ? (
          <div className="mb-4">
            <p className="mb-2">This agent is scheduled to run at:</p>
            <div className="bg-yellow-100 p-3 rounded-md flex items-center">
              <Clock className="h-5 w-5 mr-2 text-yellow-600" />
              <span className="font-medium">{scheduledDateTime}</span>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Date</label>
              <div className="relative">
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md pl-10"
                />
                <Calendar className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1">Time</label>
              <div className="relative">
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md pl-10"
                />
                <Clock className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
              </div>
            </div>
            
            <div>
              <label className="flex items-center text-sm font-medium">
                <input
                  type="checkbox"
                  checked={isOneTime}
                  onChange={(e) => setIsOneTime(e.target.checked)}
                  className="mr-2 h-4 w-4 rounded border-gray-300 text-blue-600"
                />
                Run once (vs. start continuous execution)
              </label>
            </div>
          </div>
        )}
        
        {error && (
          <div className="mt-4 p-3 bg-red-100 text-red-700 rounded-md text-sm">
            {error}
          </div>
        )}
        
        <div className="mt-6 flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border rounded-md hover:bg-gray-50"
          >
            Close
          </button>
          
          {isCurrentlyScheduled ? (
            <button
              onClick={handleCancel}
              className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600"
            >
              Cancel Schedule
            </button>
          ) : (
            <button
              onClick={handleSchedule}
              className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
            >
              Schedule
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ScheduleAgentModal;
