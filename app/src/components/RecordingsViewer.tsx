import { useState, useEffect, useMemo, CSSProperties } from 'react';
import { getAllRecordings, deleteRecording } from '@utils/recordingsDB'; // Assuming deleteRecording exists
import ClipPlayer from '@components/ClipPlayer';
import { Play, ChevronUp, Download, Trash2, Clock } from 'lucide-react';
import { format, isToday, isYesterday, isThisWeek } from 'date-fns';

// --- TYPE DEFINITIONS ---
interface ClipMarker {
  label: string;
  timestamp: number;
}
interface RecordingData {
  id: string;
  blob: Blob;
  createdAt: Date; // Important: ensure this is a Date object
  metadata: ClipMarker[];
}

// --- STYLING (matches your app's theme) ---
const viewerStyles: { [key: string]: CSSProperties } = {
  container: {
    padding: '16px',
    backgroundColor: '#f9fafb',
    minHeight: '100vh',
  },
  header: {
    fontSize: '24px',
    fontWeight: 600,
    color: '#111827',
    marginBottom: '24px',
  },
  groupContainer: {
    marginBottom: '24px',
  },
  groupTitle: {
    fontSize: '14px',
    fontWeight: 500,
    color: '#6b7280',
    paddingBottom: '8px',
    borderBottom: '1px solid #e5e7eb',
    marginBottom: '12px',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    border: '1px solid #e5e7eb',
    boxShadow: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
    marginBottom: '12px',
    overflow: 'hidden', // to contain the player's border-top
    transition: 'box-shadow 0.2s ease-in-out',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    cursor: 'pointer',
  },
  cardInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    color: '#374151',
    fontWeight: 500,
  },
  cardActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  iconButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '6px',
    borderRadius: '6px',
    border: 'none',
    backgroundColor: 'transparent',
    cursor: 'pointer',
    color: '#6b7280',
  },
  deleteButton: {
    color: '#ef4444',
  },
  playerContainer: {
    maxHeight: '1000px', // for transition effect
    transition: 'max-height 0.5s ease-in-out, visibility 0.5s ease-in-out',
    overflow: 'hidden',
  },
  playerContainerCollapsed: {
    maxHeight: '0',
    visibility: 'hidden',
  },
  noRecordingsText: {
    color: '#6b7280',
    padding: '20px',
    textAlign: 'center',
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    border: '1px solid #e5e7eb',
  },
};

// --- HELPER FUNCTION ---
const groupRecordingsByDate = (recordings: RecordingData[]) => {
    const groups: { [key: string]: RecordingData[] } = {};
    const sortedRecordings = [...recordings].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    sortedRecordings.forEach(rec => {
        const date = rec.createdAt;
        let groupKey: string;

        if (isToday(date)) {
            groupKey = 'Today';
        } else if (isYesterday(date)) {
            groupKey = 'Yesterday';
        } else if (isThisWeek(date, { weekStartsOn: 1 })) {
            groupKey = 'This Week';
        } else {
            groupKey = format(date, 'MMMM d, yyyy');
        }
        
        if (!groups[groupKey]) {
            groups[groupKey] = [];
        }
        groups[groupKey].push(rec);
    });
    return groups;
};


// --- MAIN COMPONENT ---
export default function RecordingsViewer() {
    const [recordings, setRecordings] = useState<RecordingData[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [expandedRecordingId, setExpandedRecordingId] = useState<string | null>(null);

    useEffect(() => {
        const fetchRecordings = async () => {
            try {
                const allRecs = await getAllRecordings();
                // Ensure createdAt is a Date object for reliable sorting and formatting
                const formattedRecs = allRecs.map(rec => ({
                  ...rec,
                  createdAt: rec.createdAt instanceof Date ? rec.createdAt : new Date(rec.createdAt),
                }));
                setRecordings(formattedRecs);
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                setError(`Failed to load recordings: ${msg}`);
            }
        };
        fetchRecordings();
    }, []);

    const groupedRecordings = useMemo(() => groupRecordingsByDate(recordings), [recordings]);

    const handleToggleExpand = (id: string) => {
        setExpandedRecordingId(prevId => (prevId === id ? null : id));
    };

    const handleDownload = (e: React.MouseEvent, recording: RecordingData) => {
        e.stopPropagation(); // Prevent card from toggling
        const url = URL.createObjectURL(recording.blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Observer-Recording-${recording.createdAt.toISOString()}.mp4`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleDelete = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation(); // Prevent card from toggling
        if (window.confirm('Are you sure you want to permanently delete this recording?')) {
            try {
                await deleteRecording(id);
                setRecordings(prev => prev.filter(rec => rec.id !== id));
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                setError(`Failed to delete recording: ${msg}`);
            }
        }
    };

    if (error) {
        return <div style={{ color: 'red', padding: '20px' }}>Error: {error}</div>;
    }

    return (
        <div style={viewerStyles.container}>
            <h1 style={viewerStyles.header}>Recordings</h1>
            
            {recordings.length > 0 ? (
                Object.entries(groupedRecordings).map(([groupTitle, groupRecordings]) => (
                    <div key={groupTitle} style={viewerStyles.groupContainer}>
                        <h2 style={viewerStyles.groupTitle}>{groupTitle}</h2>
                        {groupRecordings.map(recording => {
                            const isExpanded = expandedRecordingId === recording.id;
                            return (
                                <div key={recording.id} style={viewerStyles.card}>
                                    <header 
                                        style={viewerStyles.cardHeader} 
                                        onClick={() => handleToggleExpand(recording.id)}
                                    >
                                        <div style={viewerStyles.cardInfo}>
                                            <Clock size={16} />
                                            <span>Recording at {format(recording.createdAt, 'p')}</span>
                                        </div>
                                        <div style={viewerStyles.cardActions}>
                                            <button 
                                                style={viewerStyles.iconButton}
                                                title={isExpanded ? 'Collapse' : 'Play'}
                                            >
                                                {isExpanded ? <ChevronUp size={20} /> : <Play size={20} />}
                                            </button>
                                            <button 
                                                style={viewerStyles.iconButton}
                                                title="Download"
                                                onClick={(e) => handleDownload(e, recording)}
                                            >
                                                <Download size={18} />
                                            </button>
                                            <button 
                                                style={{...viewerStyles.iconButton, ...viewerStyles.deleteButton}}
                                                title="Delete"
                                                onClick={(e) => handleDelete(e, recording.id)}
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </div>
                                    </header>
                                    <div style={isExpanded ? viewerStyles.playerContainer : viewerStyles.playerContainerCollapsed}>
                                        {/* The player is now always rendered, just hidden by the parent div's style */}
                                        <ClipPlayer recording={recording} />
                                    </div>

                                </div>
                            );
                        })}
                    </div>
                ))
            ) : (
                <p style={viewerStyles.noRecordingsText}>
                    No recordings found. Start an agent and use the recording tools to create one!
                </p>
            )}
        </div>
    );
}
