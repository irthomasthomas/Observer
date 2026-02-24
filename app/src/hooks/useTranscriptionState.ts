import { useState, useEffect } from 'react';
import { AudioStreamType } from '@utils/streamManager';
import { TranscriptionStateManager, TranscriptionState } from '@utils/whisper/TranscriptionStateManager';

/**
 * Hook to subscribe to transcription state for a specific audio stream type.
 * Queries current state on mount (survives component reload mid-recording).
 */
export const useTranscriptionState = (type: AudioStreamType): TranscriptionState => {
  const [state, setState] = useState<TranscriptionState>(() =>
    TranscriptionStateManager.getState(type)
  );

  useEffect(() => {
    // Get current state immediately (in case it changed between render and effect)
    setState(TranscriptionStateManager.getState(type));

    // Subscribe to updates
    return TranscriptionStateManager.subscribe(type, setState);
  }, [type]);

  return state;
};
