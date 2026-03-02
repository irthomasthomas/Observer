import { TranscriptionRouter } from './TranscriptionRouter';
import { AudioStreamType } from '../streamManager';
import { Logger } from '../logging';
import { TranscriptionStateManager } from './TranscriptionStateManager';
import { TranscriptionSubscriber } from './TranscriptionSubscriber';

const CLOUD_WS_URL = 'wss://api.observer-ai.com/v1/audio/transcriptions/stream';

/**
 * @deprecated Use UnifiedTranscriptionService instead.
 *
 * This service uses MediaRecorder to capture audio as WebM, which requires
 * encoding overhead. The unified pipeline (UnifiedTranscriptionService)
 * streams raw PCM samples directly as Int16, eliminating encoding steps.
 *
 * To enable the unified pipeline:
 *   localStorage.setItem('unified_pcm_pipeline', 'true')
 *
 * This service will be removed in a future version.
 *
 * ---
 *
 * Cloud transcription service using WebSocket for real-time streaming.
 * Connects to Observer API which forwards to Google Speech-to-Text (latest_long model).
 * Auto-reconnects every ~5 minutes when Google's stream limit is reached.
 */
export class CloudTranscriptionService {
  private ws: WebSocket | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private isRunning = false;
  private currentStream: MediaStream | null = null;
  private streamType: AudioStreamType = 'microphone';

  // Subscriber management - services push to all subscribers
  private subscribers = new Set<TranscriptionSubscriber>();

  public async start(stream: MediaStream, streamType?: AudioStreamType): Promise<void> {
    if (this.isRunning) {
      Logger.warn('CloudTranscriptionService', 'Service already running');
      return;
    }

    this.isRunning = true;
    this.currentStream = stream;
    this.streamType = streamType || 'microphone';

    Logger.info('CloudTranscriptionService', `Starting cloud transcription for ${this.streamType}`);

    await this.connect();
  }

  private async connect(): Promise<void> {
    if (!this.currentStream) {
      Logger.error('CloudTranscriptionService', 'No stream available');
      return;
    }

    try {
      const token = await TranscriptionRouter.getToken();

      const ws = new WebSocket(CLOUD_WS_URL);
      this.ws = ws;

      ws.onopen = () => {
        Logger.info('CloudTranscriptionService', 'WebSocket connected');

        // Send authentication message
        if (this.ws === ws && token) {
          ws.send(JSON.stringify({ token }));
        }

        // Start streaming audio with fresh MediaRecorder
        this.startMediaRecorder();

        // Notify state manager
        TranscriptionStateManager.chunkRecordingStarted(this.streamType, 0);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const { text, is_final, reconnect } = data;

          // Server signals Google's 5-min limit reached - reconnect seamlessly
          if (reconnect) {
            Logger.info('CloudTranscriptionService', 'Server requested reconnect (5-min limit)');
            this.reconnect();
            return;
          }

          if (text) {
            if (is_final) {
              // Final result: commit to all subscribers
              this.commitToSubscribers(text);
              Logger.debug('CloudTranscriptionService', `Final: ${text.slice(0, 50)}...`);

              // Notify state manager for UI updates
              TranscriptionStateManager.chunkTranscriptionEnded(this.streamType, text, 0);
            } else {
              // Interim result: replace interim slot in all subscribers
              this.setInterimToSubscribers(text);

              // Notify state manager for UI updates
              TranscriptionStateManager.setInterimText(this.streamType, text);
            }
          }
        } catch (error) {
          Logger.error('CloudTranscriptionService', `Failed to parse message: ${error}`);
        }
      };

      ws.onerror = () => {
        Logger.error('CloudTranscriptionService', 'WebSocket error');
      };

      ws.onclose = (e) => {
        Logger.info('CloudTranscriptionService', `WebSocket closed: code=${e.code}`);
        // Only cleanup if this is still the active WebSocket (not replaced by reconnect)
        if (this.ws === ws) {
          this.stopMediaRecorder();
          this.ws = null;
        }
      };

    } catch (error) {
      Logger.error('CloudTranscriptionService', `Failed to connect: ${error}`);
      this.stopMediaRecorder();
    }
  }

  /**
   * Seamlessly reconnect when Google's 5-minute streaming limit is reached.
   * Stops current MediaRecorder, closes WebSocket, and reconnects with fresh headers.
   */
  private reconnect(): void {
    if (!this.isRunning || !this.currentStream) return;

    Logger.info('CloudTranscriptionService', 'Reconnecting...');

    // Stop current MediaRecorder
    this.stopMediaRecorder();

    // Close old WebSocket (onclose won't interfere because we clear this.ws first)
    const oldWs = this.ws;
    this.ws = null;
    if (oldWs) {
      oldWs.close();
    }

    // Reconnect immediately with fresh MediaRecorder (new WebM headers)
    this.connect();
  }

  private startMediaRecorder(): void {
    if (!this.currentStream || this.currentStream.getAudioTracks().length === 0) {
      Logger.error('CloudTranscriptionService', 'No active audio stream');
      return;
    }

    try {
      this.mediaRecorder = new MediaRecorder(this.currentStream, {
        mimeType: 'audio/webm;codecs=opus'
      });
    } catch (e) {
      Logger.warn('CloudTranscriptionService', 'opus not supported, using default');
      this.mediaRecorder = new MediaRecorder(this.currentStream);
    }

    this.mediaRecorder.ondataavailable = async (e) => {
      if (e.data.size > 0 && this.ws?.readyState === WebSocket.OPEN) {
        const arrayBuffer = await e.data.arrayBuffer();
        this.ws.send(arrayBuffer);
      }
    };

    this.mediaRecorder.onerror = (e) => {
      Logger.error('CloudTranscriptionService', `MediaRecorder error: ${e}`);
    };

    // Stream chunks continuously
    this.mediaRecorder.start(200);
    Logger.debug('CloudTranscriptionService', 'Streaming audio (200ms chunks)');
  }

  private stopMediaRecorder(): void {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    this.mediaRecorder = null;
  }

  public stop(): void {
    if (!this.isRunning) return;

    Logger.info('CloudTranscriptionService', 'Stopping');
    this.isRunning = false;

    this.stopMediaRecorder();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.currentStream = null;

    // Notify state manager
    TranscriptionStateManager.streamStopped(this.streamType);
  }

  public isReady(): boolean {
    return true;
  }

  // --- Subscriber Management ---

  public addSubscriber(subscriber: TranscriptionSubscriber): void {
    this.subscribers.add(subscriber);
    Logger.debug('CloudTranscriptionService', `Added subscriber ${subscriber.id}, total: ${this.subscribers.size}`);
  }

  public removeSubscriber(subscriber: TranscriptionSubscriber): void {
    this.subscribers.delete(subscriber);
    Logger.debug('CloudTranscriptionService', `Removed subscriber ${subscriber.id}, total: ${this.subscribers.size}`);
  }

  private setInterimToSubscribers(text: string): void {
    for (const subscriber of this.subscribers) {
      subscriber.setInterimText(text);
    }
  }

  private commitToSubscribers(text: string): void {
    for (const subscriber of this.subscribers) {
      subscriber.commitText(text);
    }
  }
}
