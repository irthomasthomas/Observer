import { StreamManager } from './streamManager';
import { saveRecordingToDb } from './recordingsDB';

class Manager {
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private isRecording: boolean = false;

  /**
   * Starts a new recording session using the active streams from StreamManager.
   * It combines the screen video and system audio into a single output file.
   */
  public startRecording(): void {
    if (this.isRecording) {
      console.warn("RecordingManager: startRecording called while already recording.");
      return;
    }

    const { screenStream, audioStream } = StreamManager.getCurrentState();

    if (!screenStream) {
      console.error("RecordingManager: Cannot start recording, screen stream is not available.");
      return;
    }

    // Combine video and audio tracks into one stream for the recorder
    const tracks = [...screenStream.getVideoTracks()];
    if (audioStream) {
      tracks.push(...audioStream.getAudioTracks());
    }
    const combinedStream = new MediaStream(tracks);

    // Check for browser compatibility and choose a MIME type
    // video/webm;codecs=vp9,opus is a good default for quality and compatibility
    const mimeType = 'video/webm;codecs=vp9,opus';
    if (!MediaRecorder.isTypeSupported(mimeType)) {
        console.error(`RecordingManager: MIME type ${mimeType} not supported.`);
        // Fallback or error handling here
        return;
    }

    this.mediaRecorder = new MediaRecorder(combinedStream, { mimeType });
    this.isRecording = true;
    this.recordedChunks = []; // Clear previous chunks

    // Event handler for when a chunk of data is available
    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.recordedChunks.push(event.data);
      }
    };

    // Event handler for when the recording is stopped
    this.mediaRecorder.onstop = async () => {
      console.log("Recording stopped. Processing and saving data...");
      const recordingBlob = new Blob(this.recordedChunks, { type: this.mediaRecorder?.mimeType });
      
      try {
        await saveRecordingToDb(recordingBlob);
      } catch (error) {
        console.error("RecordingManager: Failed to save recording to DB.", error);
      }
      
      // Reset state
      this.isRecording = false;
      this.recordedChunks = [];
      this.mediaRecorder = null;
    };

    // Start recording. You can specify a timeslice (e.g., 1000ms) to get
    // ondataavailable events periodically, which is useful for live streaming
    // but not necessary for simple recording.
    this.mediaRecorder.start();
    console.log("RecordingManager: Recording has started.");
  }

  /**
   * Stops the current recording session and triggers the saving process.
   */
  public stopRecording(): void {
    if (!this.isRecording || !this.mediaRecorder) {
      console.warn("RecordingManager: stopRecording called when not recording.");
      return;
    }

    // The 'onstop' event handler will take care of the rest
    this.mediaRecorder.stop();
  }

  /**
   * Public getter to check the recording status from other parts of the app.
   * @returns {boolean} True if a recording is currently in progress.
   */
  public getIsRecording(): boolean {
    return this.isRecording;
  }
}

// Export a singleton instance so the whole app shares one recording manager
export const recordingManager = new Manager();
