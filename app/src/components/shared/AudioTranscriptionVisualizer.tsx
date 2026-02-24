import React, { useRef, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { AudioStreamType } from '@utils/streamManager';
import { useTranscriptionState } from '@hooks/useTranscriptionState';

interface AudioTranscriptionVisualizerProps {
  stream: MediaStream;
  streamType: AudioStreamType;
  title: string;
  icon: React.ReactNode;
  onClick?: () => void;
}

/**
 * Shared audio visualization component with transcription progress.
 * Used by SensorPreviewPanel and SharingPermissionsModal.
 */
const AudioTranscriptionVisualizer: React.FC<AudioTranscriptionVisualizerProps> = ({
  stream,
  streamType,
  title,
  icon,
  onClick,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameId = useRef<number>();
  const state = useTranscriptionState(streamType);

  // Progress bar animation - disable transition during reset to snap to 0%
  const [progressWidth, setProgressWidth] = useState<string>('0%');
  const [isResetting, setIsResetting] = useState(false);

  useEffect(() => {
    if (!state.recordingStartedAt) {
      setProgressWidth('0%');
      setIsResetting(false);
      return;
    }

    // Disable transition and snap to 0%
    setIsResetting(true);
    setProgressWidth('0%');

    // Double RAF ensures browser has painted 0% before we re-enable transition and animate to 100%
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setIsResetting(false);
        setProgressWidth('100%');
      });
    });

    return () => cancelAnimationFrame(raf);
  }, [state.recordingStartedAt]);

  // Audio visualization
  useEffect(() => {
    if (!stream || !canvasRef.current || stream.getAudioTracks().length === 0) return;

    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);

    const canvas = canvasRef.current;
    const canvasCtx = canvas.getContext('2d')!;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animationFrameId.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);
      canvasCtx.fillStyle = '#1f2937';
      canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

      const barWidth = (canvas.width / bufferLength) * 2;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * canvas.height;
        const alpha = barHeight / canvas.height;
        canvasCtx.fillStyle = `rgba(52, 211, 153, ${alpha})`; // emerald-400
        canvasCtx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
        x += barWidth + 1;
      }
    };

    draw();

    return () => {
      if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
      source.disconnect();
      analyser.disconnect();
      audioContext.close().catch(() => {});
    };
  }, [stream]);

  // Get last N words for display
  const lastWords = useMemo(() => {
    if (!state.fullTranscript) return '';
    const words = state.fullTranscript.split(/\s+/).filter(w => w.length > 0);
    return words.slice(-25).join(' ');
  }, [state.fullTranscript]);

  // Determine current status for display
  const statusInfo = useMemo(() => {
    if (state.isTranscribing) {
      return { label: 'Transcribing', color: 'text-orange-400' };
    }
    if (state.recordingStartedAt) {
      return { label: 'Recording', color: 'text-green-400' };
    }
    // Stream is active but no transcription instance
    return { label: 'Active, not used', color: 'text-gray-500' };
  }, [state.isTranscribing, state.recordingStartedAt]);

  return (
    <div
      className={`bg-gray-800 rounded-lg p-3 flex flex-col gap-2 ${onClick ? 'cursor-pointer hover:bg-gray-750' : ''}`}
      onClick={onClick}
      title={onClick ? 'Click to view full transcription' : undefined}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-medium text-gray-300">
          {icon}
          <span>{title}</span>
          <span className={`${statusInfo.color} text-[10px] font-normal`}>
            {statusInfo.label}
          </span>
        </div>
        {state.maxChunks > 0 && (
          <span className="text-xs text-gray-400 font-mono">
            {state.chunkCount}/{state.maxChunks}
          </span>
        )}
      </div>

      {/* Waveform */}
      <canvas ref={canvasRef} className="w-full h-10 rounded" />

      {/* Progress bar */}
      <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-green-500"
          style={{
            width: progressWidth,
            transition: state.recordingStartedAt && !isResetting
              ? `width ${state.chunkDurationMs}ms linear`
              : 'none',
          }}
        />
      </div>

      {/* Transcription text with loading indicator */}
      {(lastWords || state.isTranscribing) && (
        <div className="relative overflow-hidden h-5">
          <div className="absolute inset-0 flex items-center">
            {/* Gradient fade on left */}
            <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-gray-800 to-transparent z-10 pointer-events-none" />

            {/* Text content */}
            <div className="absolute top-0 bottom-0 right-1 left-8 flex items-center justify-end overflow-hidden gap-1">
              <div
                className="text-xs text-gray-300 whitespace-nowrap overflow-hidden"
                style={{ direction: 'rtl' }}
              >
                <span style={{ direction: 'ltr', unicodeBidi: 'embed' }}>
                  {lastWords}
                </span>
              </div>
              {state.isTranscribing && (
                <Loader2 className="w-3 h-3 text-orange-400 animate-spin flex-shrink-0" />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AudioTranscriptionVisualizer;
