import { useState, useEffect } from 'react';
// ADAPTED: Import from the new db.ts utility and its main function.
import { getAllRecordings } from '@utils/recordingsDB';

// ADAPTED: Define an interface for our new recording data structure.
// This ensures type safety and makes the code easier to understand.
interface RecordingData {
  id: string;
  blob: Blob;
  createdAt: Date;
  metadata?: { label: string, time: number }[]; // For future use
}

export default function SimpleRecordingsViewer() {
    // ADAPTED: State now holds an array of RecordingData objects.
    const [recordings, setRecordings] = useState<RecordingData[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [videoUrl, setVideoUrl] = useState<string | null>(null);

    useEffect(() => {
        const fetchRecordings = async () => {
            try {
                // ADAPTED: Call the new function to get all recordings.
                const allRecordingsFromDb = await getAllRecordings();
                console.log("Fetched recordings from database:", allRecordingsFromDb);
                if (!allRecordingsFromDb) {
                    setError("Database returned null or undefined.");
                    return;
                }
                // ADAPTED: Set the state with the new data structure.
                setRecordings(allRecordingsFromDb);
            } catch (e) {
                console.error("Error fetching recordings:", e);
                const errorMessage = e instanceof Error ? e.message : String(e);
                setError(`Failed to load recordings: ${errorMessage}`);
            }
        };

        fetchRecordings();

        // This cleanup function will run when the component unmounts.
        return () => {
            if (videoUrl) {
                URL.revokeObjectURL(videoUrl);
            }
        };
    // ADAPTED: Changed dependency array to [] so this runs only once on mount.
    }, []);

    const handlePlay = (blob: Blob | undefined) => {
        if (videoUrl) {
            URL.revokeObjectURL(videoUrl);
        }
        if (!blob || blob.size === 0) {
            alert('No video data available.');
            setVideoUrl(null);
            return;
        }
        const newVideoUrl = URL.createObjectURL(blob);
        setVideoUrl(newVideoUrl);
    };

    // ADAPTED: Simplified the download handler. It now takes an ID for a unique filename.
    const handleDownload = (blob: Blob | undefined, id: string) => {
        if (!blob || blob.size === 0) {
            alert('No video data available to download.');
            return;
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        // Use the unique recording ID for a descriptive filename.
        a.download = `observer_recording_${id}.webm`; 
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    if (error) {
        return <div style={{ color: 'red', padding: '10px' }}>Error: {error}</div>;
    }

    return (
        <div>
            <h1>Recordings</h1>
            {videoUrl && (
                <div style={{ margin: '20px 0' }}>
                    <video key={videoUrl} src={videoUrl} controls autoPlay style={{ width: '100%', maxWidth: '800px', borderRadius: '8px' }}/>
                </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                {/* ADAPTED: Changed "clips" to "recordings" for clarity */}
                {recordings.length > 0 ? (
                    // Also reversing the array to show the newest recordings first.
                    [...recordings].reverse().map(recording => (
                        <div key={recording.id} style={{ border: '1px solid #333', padding: '10px', borderRadius: '8px' }}>
                            <p><strong>Recording ID:</strong> {recording.id}</p>
                            {/* ADAPTED: Use `createdAt` from our new data structure */}
                            <p><strong>Recorded At:</strong> {new Date(recording.createdAt).toLocaleString()}</p>
                            <div style={{ marginTop: '10px', display: 'flex', gap: '10px' }}>
                                {/* ADAPTED: Simplified to a single set of buttons since we have one blob */}
                                {recording.blob && recording.blob.size > 0 ? (
                                    <>
                                        <button onClick={() => handlePlay(recording.blob)}>Play Recording</button>
                                        <button onClick={() => handleDownload(recording.blob, recording.id)}>Download</button>
                                    </>
                                ) : (
                                    <p>No video data for this entry.</p>
                                )}
                            </div>
                        </div>
                    ))
                ) : (
                    <p>No recordings found. Start an agent and use the recording tools to create one!</p>
                )}
            </div>
        </div>
    );
}
