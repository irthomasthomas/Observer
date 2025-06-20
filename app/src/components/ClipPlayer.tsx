import React, { useState, useRef, useEffect, useMemo, CSSProperties } from 'react';
import ReactPlayer from 'react-player';

// --- TYPE DEFINITIONS (Unchanged) ---
interface ClipMarker {
  label: string;
  timestamp: number;
}
interface RecordingData {
  id: string;
  blob: Blob;
  createdAt: Date;
  metadata: ClipMarker[];
}

// --- PROPS INTERFACES ---
interface ClipPlayerProps {
  recording: RecordingData;
}
interface TimelineProps {
  duration: number;
  playedSeconds: number;
  markers: ClipMarker[];
  recordingStartTime: number;
  onSeek: (seconds: number) => void;
}

// --- STYLING ---
// Updated styles for a more polished look and the new "needle" playhead.
const styles: { [key: string]: CSSProperties } = {
  playerWrapper: {
    backgroundColor: '#fafafa', // Slightly off-white background
    borderTop: '1px solid #e5e7eb',
    padding: '16px',
  },
  videoArea: {
    position: 'relative',
    width: '100%',
    cursor: 'pointer',
    borderRadius: '8px',
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  controlsContainer: {
    paddingTop: '20px',
  },
  timelineContainer: {
    position: 'relative',
    width: '100%',
    height: '50px', // Increased height for better interaction
  },
  timelineTrack: {
    position: 'absolute',
    bottom: '10px', // Positioned to center the track vertically
    height: '8px', // Slightly thicker track
    width: '100%',
    backgroundColor: '#f0f0f0',
    borderRadius: '4px',
    cursor: 'pointer',
  },
  timelineProgress: {
    height: '100%',
    backgroundColor: '#3b82f6',
    borderRadius: '4px',
  },
  // NEW: Styles for the needle playhead
  timelineNeedle: {
    position: 'absolute',
    top: '0',
    bottom: '0',
    width: '2px',
    transform: 'translateX(-1px)', // Center the needle
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    pointerEvents: 'none',
  },
  timelineNeedleHandle: {
    position: 'absolute',
    top: '-4px', // Position handle above the container
    width: '12px',
    height: '12px',
    backgroundColor: '#3b82f6',
    borderRadius: '50%',
    border: '2px solid #ffffff',
    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
  },
  timelineNeedleLine: {
    width: '2px',
    height: '20px', // Line extends above and below the track
    backgroundColor: '#3b82f6',
    position: 'absolute',
    top: '2px',
  },
  marker: {
    position: 'absolute',
    bottom: '22px', // Raised to be above the taller track
    transform: 'translateX(-50%)',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  markerTag: {
    padding: '4px 8px',
    backgroundColor: '#ffffff',
    color: '#1f2937',
    borderRadius: '6px',
    fontSize: '12px',
    whiteSpace: 'nowrap',
    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
    border: '1px solid #e5e7eb',
    marginBottom: '4px',
  },
  markerTick: {
    width: '2px',
    height: '6px',
    backgroundColor: '#9ca3af',
  },
};

// --- TIMELINE COMPONENT (FIXED & RESTYLED) ---
const Timeline: React.FC<TimelineProps> = ({ duration, playedSeconds, markers, recordingStartTime, onSeek }) => {
  const [expandedMarker, setExpandedMarker] = useState<number | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const seekRatio = clickX / rect.width;
    onSeek(seekRatio * duration);
  };

  const handleMarkerClick = (markerTimestamp: number) => {
    setExpandedMarker(prev => (prev === markerTimestamp ? null : markerTimestamp));
    const markerTimeInSeconds = (markerTimestamp - recordingStartTime) / 1000;
    onSeek(markerTimeInSeconds);
  };

  const playedPercentage = duration > 0 ? (playedSeconds / duration) * 100 : 0;

  return (
    <div style={styles.timelineContainer}>
      {/* Markers render first, so they are below the timeline track in z-index */}
      {markers.map((marker) => {
        const markerTimeInSeconds = (marker.timestamp - recordingStartTime) / 1000;
        if (markerTimeInSeconds < 0 || markerTimeInSeconds > duration) return null;

        const markerPosition = (markerTimeInSeconds / duration) * 100;
        const isExpanded = expandedMarker === marker.timestamp;
        const label = isExpanded ? marker.label : `${marker.label.substring(0, 15)}${marker.label.length > 15 ? '...' : ''}`;

        return (
          <div
            key={marker.timestamp}
            style={{ ...styles.marker, left: `${markerPosition}%` }}
            onClick={(e) => {
              e.stopPropagation();
              handleMarkerClick(marker.timestamp);
            }}
          >
            <div style={styles.markerTag}>{label}</div>
            <div style={styles.markerTick} />
          </div>
        );
      })}

      {/* Main timeline track for seeking */}
      <div ref={trackRef} style={styles.timelineTrack} onClick={handleTrackClick}>
        <div style={{ ...styles.timelineProgress, width: `${playedPercentage}%` }} />
      </div>

      {/* FIX: The playhead is now a sibling of the progress bar, not a child. */}
      {/* Its position is based on the container, which solves the "stuck on right" bug. */}
      <div style={{ ...styles.timelineNeedle, left: `${playedPercentage}%` }}>
        <div style={styles.timelineNeedleHandle} />
        <div style={styles.timelineNeedleLine} />
      </div>
    </div>
  );
};


// --- CLIP PLAYER COMPONENT (Largely unchanged) ---
export default function ClipPlayer({ recording }: ClipPlayerProps) {
  const [playing, setPlaying] = useState(false);
  const [playedSeconds, setPlayedSeconds] = useState(0);
  const [duration, setDuration] = useState(0);
  const playerRef = useRef<ReactPlayer>(null);

  const videoUrl = useMemo(() => (recording.blob ? URL.createObjectURL(recording.blob) : null), [recording.blob]);

  // This logic is complex but correct, so it remains unchanged.
  const recordingStartTime = useMemo(() => {
    if (duration > 0) {
      return recording.createdAt.getTime() - duration * 1000;
    }
    return recording.createdAt.getTime();
  }, [recording.createdAt, duration]);

  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  const handleSeek = (seconds: number) => {
    playerRef.current?.seekTo(seconds, 'seconds');
    setPlayedSeconds(seconds);
  };

  const togglePlay = () => {
    setPlaying((prev) => !prev);
  };

  if (!videoUrl) return null;

  return (
    <div style={styles.playerWrapper}>
      <div style={styles.videoArea} onClick={togglePlay}>
        <ReactPlayer
          ref={playerRef}
          url={videoUrl}
          playing={playing}
          controls={false}
          width="100%"
          height="auto"
          onProgress={(state) => setPlayedSeconds(state.playedSeconds)}
          onDuration={setDuration}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
        />
      </div>

      <div style={styles.controlsContainer}>
        <Timeline
          duration={duration}
          playedSeconds={playedSeconds}
          markers={recording.metadata}
          recordingStartTime={recordingStartTime}
          onSeek={handleSeek}
        />
      </div>
    </div>
  );
}
