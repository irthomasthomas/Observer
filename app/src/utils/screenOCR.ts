import { SensorSettings } from './settings';
import { getAgentCrop, CropConfig } from './screenCapture';

export interface OCRResult {
  success?: boolean;
  text?: string;
  confidence?: number;
  error?: string;
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

export async function captureFrameAndOCR(stream: MediaStream, agentId?: string, streamType?: 'camera' | 'screen'): Promise<OCRResult> {
  try {
    const video = document.createElement('video');
    video.srcObject = stream;

    return new Promise<OCRResult>((resolve) => {
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

          // THE FIX: Get the raw Base64 data, just as before.
          const imageData = canvas.toDataURL('image/png').split(',')[1];

          // This will be passed to performOCR, which adds the prefix back on for Tesseract.
          const ocrResult = await performOCR(imageData);
          resolve(ocrResult);
        } else {
          resolve({ error: 'Failed to get canvas context' });
        }
      };
      video.onerror = () => resolve({ error: 'Video element failed to load stream.' });
    });
  } catch (error) {
    console.error('Frame capture error:', error);
    return { error: `Failed to capture frame: ${error instanceof Error ? error.message : String(error)}` };
  }
}

// Function to perform OCR on image data
async function performOCR(imageData: string): Promise<OCRResult> {
  console.log('Starting OCR processing...');

  try {
    // Lazy load Tesseract.js - only loads when OCR is actually used!
    const { createWorker } = await import('tesseract.js');

    // Initialize worker
    const worker = await createWorker(SensorSettings.getOcrLanguage(), 1, {
      workerPath: SensorSettings.getOcrWorkerPath(),
      langPath: SensorSettings.getOcrLangPath(),
      corePath: SensorSettings.getOcrCorePath(),
      logger: m => console.log('[Tesseract]', m)
    });

    // DEFAULTS:
    //const worker: Worker = await createWorker('eng', 1, {
    //  workerPath: 'https://unpkg.com/tesseract.js@6.0.0/dist/worker.min.js',
    //  langPath: 'https://tessdata.projectnaptha.com/4.0.0',
    //  corePath: 'https://unpkg.com/tesseract.js-core@4.0.2/tesseract-core.wasm.js',
    //  logger: m => console.log('[Tesseract]', m)
    //});


    // Recognize text
    const result = await worker.recognize(`data:image/png;base64,${imageData}`);

    // Terminate worker
    await worker.terminate();

    const confidenceThreshold = SensorSettings.getOcrConfidenceThreshold();
    const isConfident = result.data.confidence >= confidenceThreshold;

    console.log(`OCR processing complete. Confidence: ${result.data.confidence}`);
    return {
      success: isConfident,
      text: isConfident ? result.data.text : '', // Return empty text if below threshold
      confidence: result.data.confidence
    };


  } catch (error) {
    console.error('OCR processing error:', error);
    return {
      error: `OCR processing failed: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}
