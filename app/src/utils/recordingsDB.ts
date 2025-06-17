import { openDB, DBSchema } from 'idb';

// Define the structure of our database
interface ObserverDB extends DBSchema {
  recordings: {
    key: string; // We'll use a timestamp-based key
    value: {
      id: string;
      blob: Blob;
      createdAt: Date;
      // You can add more metadata here later, like labels from mark_clip()
      metadata?: { label: string, time: number }[];
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
export async function saveRecordingToDb(recordingBlob: Blob): Promise<string> {
  const db = await dbPromise;
  const id = `recording_${Date.now()}`;
  const recordingData = {
    id: id,
    blob: recordingBlob,
    createdAt: new Date(),
  };

  await db.put('recordings', recordingData);
  console.log(`Recording saved to IndexedDB with ID: ${id}`);
  return id;
}

/**
 * (Optional) A function to retrieve all recordings, useful for a gallery later.
 */
export async function getAllRecordings() {
    const db = await dbPromise;
    return db.getAll('recordings');
}
