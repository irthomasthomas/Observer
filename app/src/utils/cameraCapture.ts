// src/utils/cameraCapture.ts

// We can reuse the mobile device check if needed, or you can place it in a shared utility file.
// For now, let's assume it's accessible or defined elsewhere if needed.

// Keep track of the active camera stream
let activeCameraStream: MediaStream | null = null;

/**
 * Starts the user's camera and returns the MediaStream.
 * If a stream is already active, it returns the existing one.
 * Handles user permissions and provides specific error messages.
 */
export async function startCameraCapture(): Promise<MediaStream | null> {
  // If we already have an active stream, return it to avoid asking for permission again
  if (activeCameraStream) {
    return activeCameraStream;
  }

  try {
    console.log('Requesting camera access...');
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true, // We only need video for this sensor
      audio: false,
    });

    // Store the stream for later use and to track its state
    activeCameraStream = stream;

    // Add a listener for when the user stops the stream (e.g., via browser UI)
    stream.getVideoTracks()[0].onended = () => {
      console.log('Camera sharing stopped by user or browser');
      activeCameraStream = null; // Reset the state
    };

    return stream;
  } catch (error) {
    console.error('Camera access error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Provide a more helpful error if permission was denied
    if (error instanceof DOMException && error.name === 'NotAllowedError') {
      throw new Error('Camera access was denied. Please grant permission in your browser settings to use this feature.');
    }
    
    // For other errors, pass them through
    throw new Error(`Failed to start camera: ${errorMessage}`);
  }
}

/**
 * Stops all tracks on the active camera stream and resets the state.
 */
export function stopCameraCapture(): void {
  if (activeCameraStream) {
    activeCameraStream.getTracks().forEach(track => track.stop());
    activeCameraStream = null;
    console.log('Camera capture stopped');
  }
}

/**
 * Captures a single frame from the active camera stream and returns it as a Base64 encoded PNG.
 * If the stream isn't running, it will attempt to start it.
 * @returns A promise that resolves with the Base64 string (without the data URI prefix) or null on failure.
 */
export async function captureCameraImage(): Promise<string | null> {
  let stream = activeCameraStream;
  // If no active stream, try to start one
  if (!stream) {
    stream = await startCameraCapture();
    if (!stream) {
      console.error('Failed to start camera capture for image');
      return null;
    }
  }

  try {
    // Create a temporary video element to play the stream
    const video = document.createElement('video');
    video.srcObject = stream;

    // Return a promise that resolves once the frame is captured
    return new Promise<string | null>((resolve) => {
      // When the video metadata is loaded, we know its dimensions
      video.onloadedmetadata = () => {
        video.play();

        // Create a canvas to draw the video frame onto
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        const ctx = canvas.getContext('2d');
        if (ctx) {
          // Draw the current video frame to the canvas
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          
          // Get the image data as a Base64 string and remove the data URI prefix
          // e.g., "data:image/png;base64,iVBORw0KGgo..." -> "iVBORw0KGgo..."
          const base64Image = canvas.toDataURL('image/png').split(',')[1];
          resolve(base64Image);
        } else {
          console.error('Failed to get canvas 2D context');
          resolve(null);
        }
      };
      video.onerror = (err) => {
        console.error("Video element error:", err);
        resolve(null);
      }
    });
  } catch (error) {
    console.error('Frame capture from camera error:', error);
    return null;
  }
}
