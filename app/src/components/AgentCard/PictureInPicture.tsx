// PictureInPicture.tsx - HTML5 video PiP for keeping app alive on mobile
import React, { useRef, useEffect, useState } from 'react';
import { Eye, AlertTriangle } from 'lucide-react';
import { isPipSupported } from '@utils/pictureInPicture';
import { Logger } from '@utils/logging';

type AgentLiveStatus = 'STARTING' | 'CAPTURING' | 'THINKING' | 'RESPONDING' | 'WAITING' | 'SKIPPED' | 'SLEEPING' | 'IDLE';

interface PictureInPictureProps {
  agentName?: string;
  status: AgentLiveStatus;
  loopProgress?: number;
  sleepProgress?: number;
  loopDurationMs?: number;
  sleepDurationMs?: number;
  lastResponse: string;
  onPipClosed: () => void;
  // Sensor streams for preview
  screenVideoStream?: MediaStream | null;
  cameraStream?: MediaStream | null;
}

const PictureInPicture: React.FC<PictureInPictureProps> = ({
  agentName,
  status,
  loopProgress,
  sleepProgress,
  loopDurationMs,
  sleepDurationMs,
  lastResponse,
  onPipClosed,
  screenVideoStream,
  cameraStream,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const sensorVideoRef = useRef<HTMLVideoElement>(null); // Hidden video for sensor preview
  const animationFrameRef = useRef<number>();
  const streamRef = useRef<MediaStream | null>(null);

  const [isPipActive, setIsPipActive] = useState(false);
  const [showInstructions, setShowInstructions] = useState(true);
  const [pipNotSupported, setPipNotSupported] = useState(false);

  // Check PiP support on mount
  useEffect(() => {
    if (!isPipSupported()) {
      Logger.warn('PiP', 'Picture-in-Picture not supported on this device');
      setPipNotSupported(true);
    }
  }, []);

  // Format time remaining
  const formatTimeRemaining = (durationMs: number, progress: number, isFilling: boolean): string => {
    let remainingSeconds = 0;
    if (isFilling) {
      // WAITING: fills 0→100%
      remainingSeconds = Math.ceil((durationMs * (100 - progress)) / 100 / 1000);
    } else {
      // SLEEPING: drains 100→0%
      remainingSeconds = Math.ceil((durationMs * progress) / 100 / 1000);
    }

    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;

    if (minutes > 0) {
      return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${seconds}s`;
  };

  // Get status info (icon emoji and text)
  const getStatusInfo = (status: AgentLiveStatus): { emoji: string; text: string; color: string } => {
    switch (status) {
      case 'STARTING': return { emoji: '⚡', text: 'Starting', color: '#FCD34D' };
      case 'CAPTURING': return { emoji: '👁️', text: 'Capturing', color: '#06B6D4' };
      case 'THINKING': return { emoji: '🤔', text: 'Thinking', color: '#A78BFA' };
      case 'RESPONDING': return { emoji: '💬', text: 'Responding', color: '#60A5FA' };
      case 'WAITING': return { emoji: '⏱️', text: 'Waiting', color: '#9CA3AF' };
      case 'SKIPPED': return { emoji: '⏭️', text: 'Skipped', color: '#F59E0B' };
      case 'SLEEPING': return { emoji: '😴', text: 'Sleeping', color: '#60A5FA' };
      default: return { emoji: '⏸️', text: 'Idle', color: '#6B7280' };
    }
  };

  // Draw split view: sensors on left, status on right
  const drawStatusFrame = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const halfWidth = width / 2;

    // Clear canvas with dark background
    ctx.fillStyle = '#1F2937';
    ctx.fillRect(0, 0, width, height);

    // LEFT HALF: Draw sensor preview
    const sensorVideo = sensorVideoRef.current;
    if (sensorVideo && sensorVideo.readyState >= 2) {
      // Video is ready, draw it on the left half
      const videoAspect = sensorVideo.videoWidth / sensorVideo.videoHeight;
      const targetAspect = halfWidth / height;

      let drawWidth, drawHeight, offsetX = 0, offsetY = 0;

      if (videoAspect > targetAspect) {
        // Video is wider - fit to width
        drawWidth = halfWidth;
        drawHeight = halfWidth / videoAspect;
        offsetY = (height - drawHeight) / 2;
      } else {
        // Video is taller - fit to height
        drawHeight = height;
        drawWidth = height * videoAspect;
        offsetX = (halfWidth - drawWidth) / 2;
      }

      ctx.drawImage(sensorVideo, offsetX, offsetY, drawWidth, drawHeight);
    } else {
      // No video, show placeholder
      ctx.fillStyle = '#374151';
      ctx.fillRect(0, 0, halfWidth, height);
      ctx.fillStyle = '#9CA3AF';
      ctx.font = '24px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('No Sensor', halfWidth / 2, height / 2);
    }

    // Draw vertical divider line
    ctx.strokeStyle = '#4B5563';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(halfWidth, 0);
    ctx.lineTo(halfWidth, height);
    ctx.stroke();

    // RIGHT HALF: Draw status info
    const rightCenter = halfWidth + halfWidth / 2;
    const statusInfo = getStatusInfo(status);

    // Draw status emoji
    ctx.font = 'bold 60px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(statusInfo.emoji, rightCenter, height * 0.25);

    // Draw status text
    ctx.font = 'bold 32px Arial';
    ctx.fillStyle = statusInfo.color;
    ctx.fillText(statusInfo.text, rightCenter, height * 0.45);

    // Draw timer if WAITING or SLEEPING
    if ((status === 'WAITING' || status === 'SLEEPING') &&
        (loopProgress !== undefined || sleepProgress !== undefined) &&
        (loopDurationMs || sleepDurationMs)) {
      const progress = status === 'SLEEPING' ? (sleepProgress || 0) : (loopProgress || 0);
      const duration = status === 'SLEEPING' ? sleepDurationMs : loopDurationMs;
      const timeStr = formatTimeRemaining(duration || 0, progress, status === 'WAITING');

      ctx.font = 'bold 28px Arial';
      ctx.fillStyle = '#E5E7EB';
      ctx.fillText(timeStr, rightCenter, height * 0.6);
    }

    // Draw agent name
    if (agentName) {
      ctx.font = '18px Arial';
      ctx.fillStyle = '#9CA3AF';
      ctx.fillText(agentName, rightCenter, height * 0.78);
    }

    // Draw last response snippet (wrapped to fit right half)
    if (lastResponse && lastResponse.trim()) {
      const maxLength = 30;
      const truncated = lastResponse.length > maxLength
        ? lastResponse.substring(0, maxLength) + '...'
        : lastResponse;

      ctx.font = '16px Arial';
      ctx.fillStyle = '#D1D5DB';

      // Word wrap for right half
      const maxWidth = halfWidth - 20;
      const words = truncated.split(' ');
      let line = '';
      let y = height * 0.88;

      for (const word of words) {
        const testLine = line + word + ' ';
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && line !== '') {
          ctx.fillText(line, rightCenter, y);
          line = word + ' ';
          y += 20;
          if (y > height * 0.95) break; // Stop if too many lines
        } else {
          line = testLine;
        }
      }
      if (line && y <= height * 0.95) {
        ctx.fillText(line, rightCenter, y);
      }
    }
  };

  // Setup sensor video stream
  useEffect(() => {
    const sensorVideo = sensorVideoRef.current;
    if (!sensorVideo) return;

    // Use screen video if available, otherwise camera
    const stream = screenVideoStream || cameraStream;
    if (stream) {
      sensorVideo.srcObject = stream;
      sensorVideo.play().catch(err => Logger.warn('PiP', `Failed to play sensor video: ${err}`));
    } else {
      sensorVideo.srcObject = null;
    }
  }, [screenVideoStream, cameraStream]);

  // Initialize canvas stream and video
  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    // Set canvas size (16:9 aspect ratio)
    canvas.width = 960;
    canvas.height = 540;

    // Create MediaStream from canvas at 2 fps
    try {
      const stream = canvas.captureStream(2);
      streamRef.current = stream;
      video.srcObject = stream;
      Logger.info('PiP', 'Canvas stream created successfully');
    } catch (error) {
      Logger.error('PiP', `Failed to create canvas stream: ${error}`);
    }

    return () => {
      // Cleanup
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // Render loop - redraw canvas when status changes
  useEffect(() => {
    const renderLoop = () => {
      drawStatusFrame();
      animationFrameRef.current = requestAnimationFrame(renderLoop);
    };

    renderLoop();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [status, loopProgress, sleepProgress, agentName, lastResponse, screenVideoStream, cameraStream]);

  // Setup PiP event listeners
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleEnterPip = () => {
      Logger.info('PiP', 'Entered Picture-in-Picture mode');
      setIsPipActive(true);
      setShowInstructions(false);
    };

    const handleLeavePip = () => {
      Logger.info('PiP', 'Left Picture-in-Picture mode');
      setIsPipActive(false);
      onPipClosed(); // Stop agent loop
    };

    video.addEventListener('enterpictureinpicture', handleEnterPip);
    video.addEventListener('leavepictureinpicture', handleLeavePip);

    return () => {
      video.removeEventListener('enterpictureinpicture', handleEnterPip);
      video.removeEventListener('leavepictureinpicture', handleLeavePip);
    };
  }, [onPipClosed]);

  // Show warning if PiP not supported
  if (pipNotSupported) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-semibold text-yellow-900 mb-1">Picture-in-Picture Not Supported</h4>
            <p className="text-sm text-yellow-800">
              Your device does not support Picture-in-Picture. The app may suspend when you switch to another app or lock your screen.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-4">
      {/* Hidden canvas for rendering */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* Hidden video element for sensor stream */}
      <video
        ref={sensorVideoRef}
        muted
        autoPlay
        playsInline
        style={{ display: 'none' }}
      />

      {/* Video element with PiP controls */}
      <div className="bg-black rounded-lg overflow-hidden relative">
        <video
          ref={videoRef}
          muted
          autoPlay
          playsInline
          controls
          className="w-full aspect-video object-contain"
        />

        {/* Instruction overlay (shown until PiP is activated) */}
        {showInstructions && !isPipActive && (
          <div className="absolute inset-0 bg-black bg-opacity-75 flex items-center justify-center p-6 pointer-events-none">
            <div className="text-center">
              <div className="bg-blue-600 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                <Eye className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-white text-lg font-semibold mb-2">
                Keep Observer Running
              </h3>
              <p className="text-gray-300 text-sm max-w-md">
                Tap the Picture-in-Picture button in the video controls below to keep the agent running when you switch apps.
              </p>
              <div className="mt-4 flex items-center justify-center gap-2 text-blue-400 text-xs">
                <span>Look for the</span>
                <span className="border border-blue-400 rounded px-2 py-1">PiP</span>
                <span>button</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* PiP active indicator */}
      {isPipActive && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 mt-2">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-sm text-green-800 font-medium">
              PiP Active - Agent running in background
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default PictureInPicture;
