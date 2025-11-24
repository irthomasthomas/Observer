export interface CropConfig {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AgentCropConfig {
  camera?: CropConfig;
  screen?: CropConfig;
}

// Per-agent crop storage
const agentCropConfigs = new Map<string, AgentCropConfig>();

// --- Crop Management API ---
export function setAgentCrop(agentId: string, streamType: 'camera' | 'screen', cropConfig: CropConfig | null): void {
  if (!agentCropConfigs.has(agentId)) {
    agentCropConfigs.set(agentId, {});
  }

  const agentConfig = agentCropConfigs.get(agentId)!;
  if (streamType === 'camera') {
    agentConfig.camera = cropConfig || undefined;
  } else {
    agentConfig.screen = cropConfig || undefined;
  }

  console.log(`Set ${streamType} crop for agent '${agentId}':`, cropConfig);
}

export function getAgentCrop(agentId: string, streamType: 'camera' | 'screen'): CropConfig | null {
  const agentConfig = agentCropConfigs.get(agentId);
  if (!agentConfig) return null;
  return streamType === 'camera' ? agentConfig.camera || null : agentConfig.screen || null;
}

export function removeAgentCrops(agentId: string): void {
  agentCropConfigs.delete(agentId);
  console.log(`Removed all crop configs for agent '${agentId}'`);
}

// Helper function to apply crop during drawing
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
    console.log(`Applied crop to capture: ${safeWidth}x${safeHeight} from (${safeX},${safeY})`);
  }
}

// REFACTORED: This function also accepts a stream and returns the raw Base64 data.
export async function captureScreenImage(stream: MediaStream, agentId?: string, streamType?: 'camera' | 'screen'): Promise<string | null> {
  try {
    const video = document.createElement('video');
    video.srcObject = stream;
    
    return new Promise<string | null>((resolve) => {
      video.onloadedmetadata = async () => {
        video.play();
        const canvas = document.createElement('canvas');

        // Get crop config for this agent if provided
        const crop = agentId && streamType ? getAgentCrop(agentId, streamType) : null;

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

          // THE FIX: Return only the raw Base64 string, stripping the prefix.
          // This is what the LLM API expects.
          const base64Image = canvas.toDataURL('image/png').split(',')[1];
          resolve(base64Image);
        } else {
          console.error('Failed to get canvas context');
          resolve(null);
        }
      };
      video.onerror = () => resolve(null);
    });
  } catch (error) {
    console.error('Frame capture error:', error);
    return null;
  }
}
