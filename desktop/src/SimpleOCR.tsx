//import { useState, useEffect, useRef } from 'react';
//import { createWorker, Worker } from 'tesseract.js';
//
//const OCRService = () => {
//  const [worker, setWorker] = useState<Worker | null>(null);
//  const [status, setStatus] = useState('initializing');
//  const [isProcessing, setIsProcessing] = useState(false);
//  const pollingInterval = useRef<number | null>(null);
//
//  // Initialize tesseract worker
//  useEffect(() => {
//    const initWorker = async () => {
//      try {
//        console.log('Initializing OCR worker...');
//        const newWorker = await createWorker('eng');
//        setWorker(newWorker);
//        setStatus('ready');
//        console.log('OCR worker ready');
//      } catch (error) {
//        console.error('OCR worker initialization failed:', error);
//        setStatus('error');
//      }
//    };
//
//    initWorker();
//
//    return () => {
//      if (worker) {
//        worker.terminate();
//      }
//    };
//  }, []);
//
//  // Set up polling for OCR requests
//  useEffect(() => {
//    if (status === 'ready' && !pollingInterval.current) {
//      pollingInterval.current = window.setInterval(checkForRequests, 500);
//    }
//
//    return () => {
//      if (pollingInterval.current) {
//        clearInterval(pollingInterval.current);
//        pollingInterval.current = null;
//      }
//    };
//  }, [status]);
//
//  const checkForRequests = async () => {
//    if (isProcessing || !worker) return;
//
//    try {
//      const response = await fetch('http://localhost:8000/ocr/pending-requests');
//      const data = await response.json();
//
//      if (data.requests && data.requests.length > 0) {
//        // Process the first request
//        const request = data.requests[0];
//        processImage(request.id, request.image);
//      }
//    } catch (error) {
//      console.error('Error checking for OCR requests:', error);
//    }
//  };
//
//  const processImage = async (requestId: number, imageData: string) => {
//    if (!worker) return;
//
//    setIsProcessing(true);
//    console.log(`Processing OCR request ${requestId}`);
//
//    try {
//      // Process the image with tesseract.js
//      console.time('ocr-processing');
//      const result = await worker.recognize(`data:image/png;base64,${imageData}`);
//      console.timeEnd('ocr-processing');
//
//      const text = result.data.text;
//      console.log(`OCR completed for request ${requestId}, text length: ${text.length}`);
//
//      // Send the result back
//      await fetch('http://localhost:8000/ocr/submit-result', {
//        method: 'POST',
//        headers: {
//          'Content-Type': 'application/json',
//        },
//        body: JSON.stringify({
//          request_id: requestId,
//          text: text
//        }),
//      });
//
//      console.log(`OCR result submitted for request ${requestId}`);
//    } catch (error) {
//      console.error(`OCR processing error for request ${requestId}:`, error);
//    } finally {
//      setIsProcessing(false);
//    }
//  };
//
//  return (
//    <div className="ocr-service" style={{ position: 'fixed', bottom: 10, right: 10, padding: '5px 10px', 
//                                         background: '#f0f0f0', border: '1px solid #ccc', 
//                                         borderRadius: '4px', fontSize: '12px' }}>
//      OCR Service: {status} {isProcessing ? '(Processing...)' : ''}
//    </div>
//  );
//};
//
//export default OCRService;
