import { CropConfig, getAgentCrop } from './screenCapture';

// Helper function to apply crop during drawing (reused from screenCapture logic)
function drawVideoWithCrop(ctx: CanvasRenderingContext2D, video: HTMLVideoElement, crop: CropConfig | null): void {
  if (!crop) {
    // No crop, draw full video
    ctx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
    return;
  }

  // Apply crop: source crop coordinates, destination fills canvas
  const safeX = Math.min(crop.x, video.videoWidth - 1);
  const safeY = Math.min(crop.y, video.videoHeight - 1);
  const safeWidth = Math.min(crop.width, video.videoWidth - safeX);
  const safeHeight = Math.min(crop.height, video.videoHeight - safeY);

  if (safeWidth > 0 && safeHeight > 0) {
    ctx.drawImage(
      video,
      safeX, safeY, safeWidth, safeHeight, // Source crop (from video)
      0, 0, ctx.canvas.width, ctx.canvas.height // Destination (fill canvas)
    );
    console.log(`Applied camera crop: ${safeWidth}x${safeHeight} from (${safeX},${safeY})`);
  }
}

/**
 * REFACTORED: Captures a single frame from a provided camera stream and returns it as a Base64 encoded PNG.
 * This is now a stateless utility function.
 * @param stream The active camera MediaStream provided by the StreamManager.
 * @param agentId Optional agent ID for crop configuration
 * @returns A promise that resolves with the raw Base64 string (without the data URI prefix) or null on failure.
 */
export async function captureCameraImage(stream: MediaStream, agentId?: string): Promise<string | null> {
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

        // Get crop config for this agent if provided
        const crop = agentId ? getAgentCrop(agentId, 'camera') : null;

        // Set canvas size based on crop or full video
        if (crop) {
          canvas.width = crop.width;
          canvas.height = crop.height;
        } else {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }

        const ctx = canvas.getContext('2d');
        if (ctx) {
          // Apply crop or draw full video
          drawVideoWithCrop(ctx, video, crop);

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
