import { useState, useEffect, useRef } from 'react';
import { createWorker, Worker } from 'tesseract.js';

const OCRService = () => {
  const [worker, setWorker] = useState<Worker | null>(null);
  const [status, setStatus] = useState('initializing');
  const [isProcessing, setIsProcessing] = useState(false);
  const pollingInterval = useRef<number | null>(null);
  
  // Initialize tesseract worker
  useEffect(() => {
    const initWorker = async () => {
      try {
        console.log('[DEBUG] Initializing OCR worker...');
        const newWorker = await createWorker('eng');
        setWorker(newWorker);
        setStatus('ready');
        console.log('[DEBUG] OCR worker ready');
      } catch (error) {
        console.error('[DEBUG] OCR worker initialization failed:', error);
        setStatus('error');
      }
    };

    initWorker();

    return () => {
      if (worker) {
        console.log('[DEBUG] Terminating OCR worker');
        worker.terminate();
      }
    };
  }, []);

  // Set up polling for images
  useEffect(() => {
    if (status === 'ready' && !pollingInterval.current) {
      console.log('[DEBUG] Starting polling for OCR images');
      pollingInterval.current = window.setInterval(checkForImages, 1000);
    }

    return () => {
      if (pollingInterval.current) {
        console.log('[DEBUG] Stopping polling interval');
        clearInterval(pollingInterval.current);
        pollingInterval.current = null;
      }
    };
  }, [status]);

  const checkForImages = async () => {
    if (isProcessing || !worker) {
      return;
    }

    try {
      console.log('[DEBUG] Checking for images to process');
      const response = await fetch('http://localhost:8000/ocr/image');
      const data = await response.json();
      
      if (data.image) {
        console.log('[DEBUG] Found image to process');
        processImage(data.image);
      } else {
        console.log('[DEBUG] No image to process');
      }
    } catch (error) {
      console.error('[DEBUG] Error checking for images:', error);
    }
  };

  const processImage = async (imageData: string) => {
    if (!worker) return;
    
    setIsProcessing(true);
    setStatus('processing');
    
    console.log(`[DEBUG] Processing image, data length: ${imageData.length}`);

    try {
      // Process with tesseract.js
      const startTime = performance.now();
      
      console.log('[DEBUG] Starting OCR recognition');
      const result = await worker.recognize(`data:image/png;base64,${imageData}`);
      
      const endTime = performance.now();
      const text = result.data.text;
      
      console.log(`[DEBUG] OCR processing took ${(endTime - startTime).toFixed(2)}ms`);
      console.log(`[DEBUG] Extracted text length: ${text.length}`);
      
      if (text) {
        console.log(`[DEBUG] First 100 chars: "${text.substring(0, 100)}"`);
      }

      console.log('[DEBUG] Submitting OCR result to server');
      await fetch('http://localhost:8000/ocr/text', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: text })
      });
      
      console.log('[DEBUG] OCR result submitted successfully');
    } catch (error) {
      console.error('[DEBUG] OCR processing error:', error);
    } finally {
      setIsProcessing(false);
      setStatus('ready');
    }
  };

  return (
    <div className="ocr-service" style={{ position: 'fixed', bottom: 10, right: 10, padding: '5px 10px', 
                                          background: '#f0f0f0', border: '1px solid #ccc', 
                                          borderRadius: '4px', fontSize: '12px' }}>
      Simple OCR: {status} {isProcessing ? '(Processing...)' : ''}
    </div>
  );
};

export default OCRService;
