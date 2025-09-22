import { useState, useEffect, useRef } from 'react';
import { StreamManager } from '@utils/streamManager';
import { AudioStreamType } from '@utils/streamManager';

interface TranscriptionState {
  fullTranscript: string;
  lastWords: string[];
  isActive: boolean;
  hasNewContent: boolean;
}

/**
 * Custom hook for polling transcription data from StreamManager
 * Uses sliding window approach to show recent words without chunk tracking
 */
export const useTranscriptionPolling = (
  streamType: AudioStreamType,
  isStreamActive: boolean,
  wordLimit: number = 25,
  pollingInterval: number = 500
): TranscriptionState => {
  const [transcriptionState, setTranscriptionState] = useState<TranscriptionState>({
    fullTranscript: '',
    lastWords: [],
    isActive: false,
    hasNewContent: false
  });

  const previousTranscriptRef = useRef('');
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const hasNewContentTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!isStreamActive) {
      // Clear polling when stream is inactive
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      setTranscriptionState(prev => ({ ...prev, isActive: false }));
      return;
    }

    // Start polling for transcription updates
    pollingIntervalRef.current = setInterval(() => {
      try {
        const currentTranscript = StreamManager.getTranscript(streamType);

        // Check if transcript has changed
        const hasChanged = currentTranscript !== previousTranscriptRef.current;

        if (hasChanged) {
          const words = currentTranscript.trim().split(/\s+/).filter(Boolean);
          const lastWords = words.slice(-wordLimit);

          setTranscriptionState({
            fullTranscript: currentTranscript,
            lastWords,
            isActive: true,
            hasNewContent: true
          });

          // Clear the "new content" flag after animation time
          if (hasNewContentTimeoutRef.current) {
            clearTimeout(hasNewContentTimeoutRef.current);
          }
          hasNewContentTimeoutRef.current = setTimeout(() => {
            setTranscriptionState(prev => ({ ...prev, hasNewContent: false }));
          }, 1000);

          previousTranscriptRef.current = currentTranscript;
        } else {
          // No change, just update isActive
          setTranscriptionState(prev => ({ ...prev, isActive: true, hasNewContent: false }));
        }
      } catch (error) {
        console.warn('Transcription polling error:', error);
        setTranscriptionState(prev => ({ ...prev, isActive: false }));
      }
    }, pollingInterval);

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
      if (hasNewContentTimeoutRef.current) {
        clearTimeout(hasNewContentTimeoutRef.current);
      }
    };
  }, [isStreamActive, streamType, wordLimit, pollingInterval]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
      if (hasNewContentTimeoutRef.current) {
        clearTimeout(hasNewContentTimeoutRef.current);
      }
    };
  }, []);

  return transcriptionState;
};