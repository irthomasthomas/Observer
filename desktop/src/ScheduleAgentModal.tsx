import React, { useState, useEffect } from 'react';
import {} from 'lucide-react';

interface Schedule {
  id: string;
  agent_id: string;
  cron_expression: string;
  name?: string;
  next_run_time?: string;
}

interface ScheduleAgentModalProps {
  agentId: string;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: () => void;
}

const ScheduleAgentModal: React.FC<ScheduleAgentModalProps> = ({
  agentId,
  isOpen,
  onClose,
  onUpdate,
}) => {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Form states
  const [scheduleName, setScheduleName] = useState('');
  const [scheduleTime, setScheduleTime] = useState('22:00'); // Default to 10:00 PM
  const [scheduleFrequency, setScheduleFrequency] = useState('daily');
  
  // Fetch existing schedules for this agent
  useEffect(() => {
    if (isOpen) {
      fetchSchedules();
    }
  }, [isOpen, agentId]);
  
  const fetchSchedules = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetch(`http://localhost:8000/schedules/${agentId}`);
      if (!response.ok) throw new Error('Failed to fetch schedules');
      const data = await response.json();
      setSchedules(data);
    } catch (err) {
      setError('Failed to load schedules');
      console.error('Error fetching schedules:', err);
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleCreateSchedule = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Convert UI-friendly time and frequency to cron expression
      const [hours, minutes] = scheduleTime.split(':');
      
      // Build cron expression - minute hour * * * for daily at specific time
      // Example: "0 22 * * *" for 10:00 PM daily
      let cronExpression = `${minutes} ${hours} * * *`;
      
      if (scheduleFrequency === 'weekly') {
        // For weekly, add day of week (Sunday)
        cronExpression = `${minutes} ${hours} * * 0`;
      }
      
      const response = await fetch('http://localhost:8000/schedules', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          agent_id: agentId,
          cron_expression: cronExpression,
          name: scheduleName || `Run at ${scheduleTime}`,
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create schedule');
      }
      
      // Reset form
      setScheduleName('');
      setScheduleTime('22:00');
      setScheduleFrequency('daily');
      
      // Refresh schedules list
      await fetchSchedules();
      
      // Notify parent component
      onUpdate();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      console.error('Error creating schedule:', err);
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleDeleteSchedule = async (scheduleId: string) => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetch(`http://localhost:8000/schedules/${scheduleId}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete schedule');
      }
      
      // Refresh schedules list
      await fetchSchedules();
      
      // Notify parent component
      onUpdate();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      console.error('Error deleting schedule:', err);
    } finally {
      setIsLoading(false);
    }
  };
  
  if (!isOpen) return null;
  
  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <h2>Schedule Agent</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>
        
        <div className="modal-content">
          {error && <div className="error">{error}</div>}
          
          <div className="section">
            <h3>Create New Schedule</h3>
            <div className="form-group">
              <label>Name (optional):</label>
              <input
                type="text"
                value={scheduleName}
                onChange={(e) => setScheduleName(e.target.value)}
                placeholder="Daily run"
                className="form-input"
              />
            </div>
            
            <div className="form-group">
              <label>Time:</label>
              <input
                type="time"
                value={scheduleTime}
                onChange={(e) => setScheduleTime(e.target.value)}
                className="form-input"
              />
            </div>
            
            <div className="form-group">
              <label>Frequency:</label>
              <select
                value={scheduleFrequency}
                onChange={(e) => setScheduleFrequency(e.target.value)}
                className="form-input"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly (Sunday)</option>
              </select>
            </div>
            
            <button
              onClick={handleCreateSchedule}
              disabled={isLoading}
              className="button create"
            >
              {isLoading ? 'Creating...' : 'Create Schedule'}
            </button>
          </div>
          
          <div className="section">
            <h3>Existing Schedules</h3>
            {schedules.length === 0 ? (
              <p>No schedules found</p>
            ) : (
              <div className="schedules-list">
                {schedules.map((schedule) => (
                  <div key={schedule.id} className="schedule-item">
                    <div className="schedule-details">
                      <span className="schedule-name">{schedule.name || 'Unnamed Schedule'}</span>
                      <span className="schedule-expression">{schedule.cron_expression}</span>
                      {schedule.next_run_time && (
                        <span className="schedule-next-run">
                          Next run: {new Date(schedule.next_run_time).toLocaleString()}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => handleDeleteSchedule(schedule.id)}
                      className="delete-button"
                      disabled={isLoading}
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="button cancel">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default ScheduleAgentModal;
