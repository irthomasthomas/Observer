/**
 * REFACTORED: Captures a single frame from a provided camera stream and returns it as a Base64 encoded PNG.
 * This is now a stateless utility function.
 * @param stream The active camera MediaStream provided by the StreamManager.
 * @returns A promise that resolves with the raw Base64 string (without the data URI prefix) or null on failure.
 */
export async function captureCameraImage(stream: MediaStream): Promise<string | null> {
  // DELETED: The logic to start its own stream is removed.
  // We now trust that the pre-processor is giving us a valid stream from the StreamManager.

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
          
          // Get the image data as a raw Base64 string for the API.
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
