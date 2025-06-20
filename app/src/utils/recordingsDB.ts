import { openDB, DBSchema } from 'idb';

export interface ClipMarker {
  label: string;
  timestamp: number; // Use number to store epoch time (Date.now()) for easy sorting/calculation
}

// Define the structure of our database
interface ObserverDB extends DBSchema {
  recordings: {
    key: string; 
    value: {
      id: string;
      blob: Blob;
      createdAt: Date;
      // The metadata property will hold an array of markers.
      // It's no longer optional, can just be an empty array.
      metadata: ClipMarker[]; 
    };
  };
}

// Initialize the database connection
const dbPromise = openDB<ObserverDB>('ObserverDB', 1, {
  upgrade(db) {
    // Create an object store for recordings if it doesn't exist
    if (!db.objectStoreNames.contains('recordings')) {
      db.createObjectStore('recordings', { keyPath: 'id' });
    }
  },
});

/**
 * Saves a recording blob to the 'recordings' object store in IndexedDB.
 * @param recordingBlob The video blob to save.
 * @returns The ID of the saved recording.
 */
export async function saveRecordingToDb(recordingBlob: Blob, markers: ClipMarker[]): Promise<string> {
  const db = await dbPromise;
  const id = `recording_${Date.now()}`;
  const recordingData = {
    id: id,
    blob: recordingBlob,
    createdAt: new Date(),
    metadata: markers, // Save the markers array
  };

  await db.put('recordings', recordingData);
  console.log(`Recording saved to IndexedDB with ID: ${id} and ${markers.length} markers.`);
  return id;
}

/**
 * (Optional) A function to retrieve all recordings, useful for a gallery later.
 */
export async function getAllRecordings() {
    const db = await dbPromise;
    return db.getAll('recordings');
}
