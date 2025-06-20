// FIX: Removed 'React' from import as it's not used with the new JSX transform.
import { useState, useEffect } from 'react';
import { getAllRecordings } from '@utils/recordingsDB';
import ClipPlayer from './ClipPlayer';

// Define the interface for our recording data
interface RecordingData {
  id: string;
  blob: Blob;
  createdAt: Date;
  metadata: { label: string; timestamp: number }[];
}

export default function RecordingsViewer() {
    const [recordings, setRecordings] = useState<RecordingData[]>([]);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchRecordings = async () => {
            try {
                const allRecordingsFromDb = await getAllRecordings();
                const formattedRecordings = allRecordingsFromDb.map(rec => ({
                  ...rec,
                  createdAt: new Date(rec.createdAt),
                }));
                setRecordings(formattedRecordings);
            } catch (e) {
                const errorMessage = e instanceof Error ? e.message : String(e);
                setError(`Failed to load recordings: ${errorMessage}`);
            }
        };
        fetchRecordings();
    }, []);

    if (error) {
        return <div style={{ color: 'red', padding: '10px' }}>Error: {error}</div>;
    }

    return (
        <div>
            <h1>Recordings</h1>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                {recordings.length > 0 ? (
                    [...recordings].reverse().map(recording => (
                        <ClipPlayer key={recording.id} recording={recording} />
                    ))
                ) : (
                    <p>No recordings found. Start an agent and use the recording tools to create one!</p>
                )}
            </div>
        </div>
    );
}
