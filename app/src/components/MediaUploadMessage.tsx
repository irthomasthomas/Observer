// src/components/MediaUploadMessage.tsx

import React, { useState, useRef } from 'react';
import { Upload, Camera, X } from 'lucide-react';

interface MediaUploadMessageProps {
  requestText: string; // The text from inside %%% %%%
  onResponse: (result: string | { type: 'image', data: string }) => void;
}

const MediaUploadMessage: React.FC<MediaUploadMessageProps> = ({ requestText, onResponse }) => {
  const [isCapturing, setIsCapturing] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUploadImage = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        // Extract base64 data (remove data:image/...;base64, prefix)
        const base64Data = result.split(',')[1];
        onResponse({ type: 'image', data: base64Data });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleTakePicture = async () => {
    setIsCapturing(true);
    try {
      // Start camera stream
      const mediaStream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'user' } 
      });
      setStream(mediaStream);

      // Create video element to capture frame
      const video = document.createElement('video');
      video.srcObject = mediaStream;
      
      return new Promise<void>((resolve) => {
        video.onloadedmetadata = () => {
          video.play();
          
          // Create canvas to draw video frame
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            
            // Get base64 image data
            const base64Image = canvas.toDataURL('image/png').split(',')[1];
            
            // Stop the stream
            mediaStream.getTracks().forEach(track => track.stop());
            setStream(null);
            setIsCapturing(false);
            
            onResponse({ type: 'image', data: base64Image });
          }
          resolve();
        };
      });
    } catch (error) {
      console.error('Camera access failed:', error);
      setIsCapturing(false);
    }
  };

  const handleDecline = () => {
    // Clean up any active stream
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setIsCapturing(false);
    onResponse("User declined sending a picture");
  };

  return (
    <div className="w-full bg-purple-50 border border-purple-200 rounded-lg p-4 relative">
      {/* Close button in top right */}
      <button 
        onClick={handleDecline}
        className="absolute top-2 right-2 p-1 rounded-full hover:bg-purple-100"
      >
        <X className="h-4 w-4 text-purple-600" />
      </button>
      
      <div className="pr-8"> {/* Add right padding for close button */}
        <p className="text-purple-800 font-medium mb-4">{requestText}</p>
        
        <div className="flex gap-3">
          <button
            onClick={handleUploadImage}
            disabled={isCapturing}
            className="px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-md hover:bg-purple-700 disabled:bg-purple-300 transition-colors flex items-center"
          >
            <Upload className="h-4 w-4 mr-2" />
            Upload Image
          </button>
          
          <button
            onClick={handleTakePicture}
            disabled={isCapturing}
            className="px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-md hover:bg-purple-700 disabled:bg-purple-300 transition-colors flex items-center"
          >
            <Camera className="h-4 w-4 mr-2" />
            {isCapturing ? 'Taking Picture...' : 'Take Picture'}
          </button>
        </div>
      </div>
      
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        style={{ display: 'none' }}
      />
    </div>
  );
};

export default MediaUploadMessage;