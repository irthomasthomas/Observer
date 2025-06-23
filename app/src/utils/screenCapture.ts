import { createWorker, Worker } from 'tesseract.js';
import { SensorSettings } from './settings';

interface OCRResult {
  success?: boolean;
  text?: string;
  confidence?: number;
  error?: string;
}


export async function captureFrameAndOCR(stream: MediaStream): Promise<OCRResult> {
  try {
    const video = document.createElement('video');
    video.srcObject = stream;
    
    return new Promise<OCRResult>((resolve) => {
      video.onloadedmetadata = async () => {
        video.play();
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');

        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          
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

// REFACTORED: This function also accepts a stream and returns the raw Base64 data.
export async function captureScreenImage(stream: MediaStream): Promise<string | null> {
  try {
    const video = document.createElement('video');
    video.srcObject = stream;
    
    return new Promise<string | null>((resolve) => {
      video.onloadedmetadata = async () => {
        video.play();
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');

        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          
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

// Function to perform OCR on image data
async function performOCR(imageData: string): Promise<OCRResult> {
  console.log('Starting OCR processing...');
  
  try {
    // Initialize worker
    const worker: Worker = await createWorker(SensorSettings.getOcrLanguage(), 1, {
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

