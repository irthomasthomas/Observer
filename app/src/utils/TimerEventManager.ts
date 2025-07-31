// src/utils/TimerEventManager.ts
// Separate concern: Timer events for UI synchronization
// Does NOT interfere with main loop execution logic

export const AGENT_ITERATION_START_EVENT = 'agentIterationStart';
export const AGENT_WAITING_START_EVENT = 'agentWaitingStart';
export const AGENT_ITERATION_SKIPPED_EVENT = 'agentIterationSkipped';

interface TimerState {
  intervalMs: number;
  nextIterationTime: number;
  isExecuting: boolean;
}

class TimerEventManager {
  private timers: Record<string, TimerState> = {};

  // Called when agent starts - minimal integration point
  public startTimer(agentId: string, intervalSeconds: number): void {
    const intervalMs = intervalSeconds * 1000;
    this.timers[agentId] = {
      intervalMs,
      nextIterationTime: Date.now() + intervalMs,
      isExecuting: false
    };
  }

  // Called when agent stops - minimal integration point  
  public stopTimer(agentId: string): void {
    delete this.timers[agentId];
  }

  // Wraps execution to emit events without changing logic
  public async wrapExecution<T>(
    agentId: string, 
    executionFn: () => Promise<T>
  ): Promise<T> {
    const timer = this.timers[agentId];
    if (!timer) return executionFn(); // No timer = no events

    // Mark as executing and emit start event
    timer.isExecuting = true;
    window.dispatchEvent(
      new CustomEvent(AGENT_ITERATION_START_EVENT, {
        detail: { agentId }
      })
    );

    try {
      const result = await executionFn();
      return result;
    } finally {
      // Always clean up execution state
      timer.isExecuting = false;
      
      // Emit waiting event if timer still exists
      if (this.timers[agentId]) {
        window.dispatchEvent(
          new CustomEvent(AGENT_WAITING_START_EVENT, {
            detail: { 
              agentId, 
              nextIterationTime: timer.nextIterationTime,
              intervalMs: timer.intervalMs
            }
          })
        );
      }
    }
  }

  // Called by setInterval - emits skip event when execution blocked
  public handleTimerTick(agentId: string): boolean {
    const timer = this.timers[agentId];
    if (!timer) return true; // No timer = allow execution

    // Update next iteration time
    timer.nextIterationTime = Date.now() + timer.intervalMs;

    if (timer.isExecuting) {
      // Emit skip event
      window.dispatchEvent(
        new CustomEvent(AGENT_ITERATION_SKIPPED_EVENT, {
          detail: { 
            agentId, 
            nextIterationTime: timer.nextIterationTime,
            intervalMs: timer.intervalMs
          }
        })
      );
      return false; // Block execution
    }

    return true; // Allow execution
  }
}

export const timerEventManager = new TimerEventManager();