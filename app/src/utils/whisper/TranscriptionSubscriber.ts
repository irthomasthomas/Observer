import { AudioStreamType } from '../streamManager';
import { Logger } from '../logging';

/**
 * Interface for transcription subscribers.
 * Each agent owns its own subscriber that accumulates transcript
 * text independently and clears at the end of each loop cycle.
 */
export interface TranscriptionSubscriber {
  /** Unique identifier for this subscriber (typically agentId:streamType) */
  readonly id: string;

  /** The audio stream type this subscriber is listening to */
  readonly streamType: AudioStreamType;

  /** Get accumulated transcript since last clear */
  getTranscript(): string;

  /** Append new transcribed text (called by transcription services) */
  appendText(text: string): void;

  /** Clear accumulated transcript (call at end of agent loop) */
  clear(): void;

  /** Cleanup (call when agent stops) */
  destroy(): void;

  /** Optional event handler for UI updates */
  onUpdate?: (transcript: string) => void;
}

/**
 * Default implementation of TranscriptionSubscriber.
 * Accumulates transcribed text independently for each agent.
 */
export class TranscriptionSubscriberImpl implements TranscriptionSubscriber {
  public readonly id: string;
  public readonly streamType: AudioStreamType;
  public onUpdate?: (transcript: string) => void;

  private accumulatedText: string[] = [];
  private isDestroyed = false;

  constructor(agentId: string, streamType: AudioStreamType) {
    this.id = `${agentId}:${streamType}`;
    this.streamType = streamType;
    Logger.debug('TranscriptionSubscriber', `Created subscriber ${this.id}`);
  }

  public getTranscript(): string {
    if (this.isDestroyed) {
      Logger.warn('TranscriptionSubscriber', `Attempted to get transcript from destroyed subscriber ${this.id}`);
      return '';
    }
    return this.accumulatedText.join(' ');
  }

  public appendText(text: string): void {
    if (this.isDestroyed) {
      Logger.warn('TranscriptionSubscriber', `Attempted to append to destroyed subscriber ${this.id}`);
      return;
    }

    if (text && text.trim()) {
      this.accumulatedText.push(text.trim());
      Logger.debug('TranscriptionSubscriber', `Subscriber ${this.id} received text (${text.length} chars), total chunks: ${this.accumulatedText.length}`);

      // Notify listener if registered
      if (this.onUpdate) {
        this.onUpdate(this.getTranscript());
      }
    }
  }

  public clear(): void {
    if (this.isDestroyed) return;

    const previousLength = this.accumulatedText.length;
    this.accumulatedText = [];
    Logger.debug('TranscriptionSubscriber', `Subscriber ${this.id} cleared (had ${previousLength} chunks)`);
  }

  public destroy(): void {
    if (this.isDestroyed) return;

    this.isDestroyed = true;
    this.accumulatedText = [];
    this.onUpdate = undefined;
    Logger.debug('TranscriptionSubscriber', `Subscriber ${this.id} destroyed`);
  }
}
