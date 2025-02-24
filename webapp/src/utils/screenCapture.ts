import { createWorker, Worker } from 'tesseract.js';

interface OCRResult {
  success?: boolean;
  text?: string;
  confidence?: number;
  error?: string;
}

// Keep track of active streams
let activeStream: MediaStream | null = null;

// Function to replace SCREEN_OCR placeholder in a prompt
export function injectOCRTextIntoPrompt(prompt: string, ocrText: string): string {
  return prompt.replace('SCREEN_OCR', ocrText);
}

// Function to start screen capture and return the stream
export async function startScreenCapture(): Promise<MediaStream | null> {
  // If we already have an active stream, return it
  if (activeStream) {
    return activeStream;
  }
  
  try {
    console.log('Starting screen capture...');
    const stream = await navigator.mediaDevices.getDisplayMedia({ 
      video: { mediaSource: "screen" } 
    });
    
    // Store the stream for later use
    activeStream = stream;
    
    // Set up a listener for when the stream ends
    stream.getVideoTracks()[0].onended = () => {
      console.log('Screen sharing stopped by user');
      activeStream = null;
    };
    
    return stream;
  } catch (error) {
    console.error('Screen capture error:', error);
    return null;
  }
}

// Function to stop the active screen capture
export function stopScreenCapture(): void {
  if (activeStream) {
    activeStream.getTracks().forEach(track => track.stop());
    activeStream = null;
    console.log('Screen capture stopped');
  }
}

// Function to capture a frame from the active stream and perform OCR
export async function captureFrameAndOCR(): Promise<OCRResult> {
  // If no active stream, try to start one
  if (!activeStream) {
    const stream = await startScreenCapture();
    if (!stream) {
      return { error: 'Failed to start screen capture' };
    }
  }
  
  try {
    // Create video element to receive the stream
    const video = document.createElement('video');
    video.srcObject = activeStream;
    
    // Return a promise that resolves when video frame is processed
    return new Promise<OCRResult>((resolve) => {
      video.onloadedmetadata = async () => {
        video.play();
        
        // Create canvas to capture video frame
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        // Draw video frame to canvas
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          
          // Get image data as base64
          const imageData = canvas.toDataURL('image/png').split(',')[1];
          
          // Perform OCR on the captured image
          const ocrResult = await performOCR(imageData);
          resolve(ocrResult);
        } else {
          resolve({ error: 'Failed to get canvas context' });
        }
      };
    });
  } catch (error) {
    console.error('Frame capture error:', error);
    return { error: `Failed to capture frame: ${error instanceof Error ? error.message : String(error)}` };
  }
}

// Legacy function for backward compatibility
export async function captureScreenAndOCR(): Promise<OCRResult> {
  const stream = await startScreenCapture();
  if (!stream) {
    return { error: 'Failed to start screen capture' };
  }
  return captureFrameAndOCR();
}

// Function to perform OCR on image data
async function performOCR(imageData: string): Promise<OCRResult> {
  console.log('Starting OCR processing...');
  
  try {
    // Initialize worker
    const worker: Worker = await createWorker('eng', 1, {
      workerPath: 'https://unpkg.com/tesseract.js@6.0.0/dist/worker.min.js',
      langPath: 'https://tessdata.projectnaptha.com/4.0.0',
      corePath: 'https://unpkg.com/tesseract.js-core@4.0.2/tesseract-core.wasm.js',
      logger: m => console.log('[Tesseract]', m)
    });
    
    // Recognize text
    const result = await worker.recognize(`data:image/png;base64,${imageData}`);
    
    // Terminate worker
    await worker.terminate();
    
    console.log('OCR processing complete');
    return { 
      success: true,
      text: result.data.text,
      confidence: result.data.confidence
    };
  } catch (error) {
    console.error('OCR processing error:', error);
    return { 
      error: `OCR processing failed: ${error instanceof Error ? error.message : String(error)}` 
    };
  }
}
