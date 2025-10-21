// components/AgentCard/ChangeDetectionIndicator.tsx
import React from 'react';
import { Camera, Monitor, HelpCircle } from 'lucide-react';
import { DetectionMode } from '@utils/change_detector';

interface ImageDetails {
  dhashSimilarity?: number;
  pixelSimilarity?: number;
  triggeredPixelCheck: boolean;
  contentType: 'camera' | 'ui' | 'unknown';
}

interface Thresholds {
  textSimilarity: number;
  dhashSimilarity: number;
  pixelSimilarity: number;
  suspiciousSimilarity: number;
}

interface ChangeDetectionData {
  agentId: string;
  isFirstIteration?: boolean;
  textChanged?: boolean;
  imagesChanged?: boolean;
  isSignificant?: boolean;
  detectionMode?: DetectionMode;
  thresholds?: Thresholds;
  imageDetails?: ImageDetails[]; // Array of image details
}

interface ChangeDetectionIndicatorProps {
  data: ChangeDetectionData;
}

// --- Individual Image Pill Component ---
interface ImagePillProps {
  details: ImageDetails;
  thresholds?: Thresholds;
  detectionMode?: DetectionMode;
}

const ImagePill: React.FC<ImagePillProps> = ({ details, thresholds, detectionMode }) => {
  const { dhashSimilarity, pixelSimilarity, triggeredPixelCheck, contentType } = details;

  if (!thresholds) {
    return null; // Can't display without thresholds
  }

  // Determine which icon to show based on content type
  const IconComponent = contentType === 'camera' ? Camera : contentType === 'ui' ? Monitor : HelpCircle;

  // Build the display text and tooltip
  let displayText = '';
  let tooltipText = '';
  let bgColorClass = '';
  let textColorClass = '';

  if (detectionMode === DetectionMode.PixelDifferenceOnly && pixelSimilarity !== undefined) {
    // UI Mode (Pixel Difference Only)
    const passed = pixelSimilarity >= thresholds.pixelSimilarity;
    displayText = `${(pixelSimilarity * 100).toFixed(1)}% ${passed ? '≥' : '<'} ${(thresholds.pixelSimilarity * 100).toFixed(0)}%`;

    bgColorClass = passed ? 'bg-green-100' : 'bg-red-100';
    textColorClass = passed ? 'text-green-800' : 'text-red-800';

    tooltipText = `UI Change Detection (Pixel Difference)\nSimilarity: ${(pixelSimilarity * 100).toFixed(2)}%\nThreshold: ${(thresholds.pixelSimilarity * 100).toFixed(0)}%\nDecision: ${passed ? 'No significant change' : 'Significant change detected'}\nAction: ${passed ? 'Model skipped' : 'Model ran'}`;

  } else if (detectionMode === DetectionMode.DHashOnly && dhashSimilarity !== undefined) {
    // Camera Mode (DHash Only)
    const passed = dhashSimilarity >= thresholds.dhashSimilarity;
    displayText = `${(dhashSimilarity * 100).toFixed(1)}% ${passed ? '≥' : '<'} ${(thresholds.dhashSimilarity * 100).toFixed(0)}%`;

    bgColorClass = passed ? 'bg-green-100' : 'bg-red-100';
    textColorClass = passed ? 'text-green-800' : 'text-red-800';

    tooltipText = `Camera Feed Detection (DHash)\nSimilarity: ${(dhashSimilarity * 100).toFixed(2)}%\nThreshold: ${(thresholds.dhashSimilarity * 100).toFixed(0)}%\nDecision: ${passed ? 'No significant change (camera noise/lighting)' : 'Significant change detected'}\nAction: ${passed ? 'Model skipped' : 'Model ran'}`;

  } else if (detectionMode === DetectionMode.Hybrid) {
    // Hybrid Mode
    if (triggeredPixelCheck && dhashSimilarity !== undefined && pixelSimilarity !== undefined) {
      // Pixel check was triggered (dhash was suspiciously similar)
      const pixelPassed = pixelSimilarity >= thresholds.pixelSimilarity;
      displayText = `${(dhashSimilarity * 100).toFixed(1)}%→${(pixelSimilarity * 100).toFixed(1)}% ${pixelPassed ? '≥' : '<'} ${(thresholds.pixelSimilarity * 100).toFixed(0)}%`;

      // Green if passed, red if failed
      bgColorClass = pixelPassed ? 'bg-green-100' : 'bg-red-100';
      textColorClass = pixelPassed ? 'text-green-800' : 'text-red-800';

      tooltipText = `Hybrid Mode: UI Suspected (Deep Check)\nDHash: ${(dhashSimilarity * 100).toFixed(2)}% (triggered pixel check at ${(thresholds.suspiciousSimilarity * 100).toFixed(2)}%)\nPixel Similarity: ${(pixelSimilarity * 100).toFixed(2)}%\nPixel Threshold: ${(thresholds.pixelSimilarity * 100).toFixed(0)}%\nDecision: ${pixelPassed ? 'No pixel-level UI changes' : 'UI changes detected'}\nAction: ${pixelPassed ? 'Model skipped' : 'Model ran'}`;

    } else if (dhashSimilarity !== undefined) {
      // Standard dhash check (camera path)
      const dhashPassed = dhashSimilarity >= thresholds.dhashSimilarity;
      displayText = `${(dhashSimilarity * 100).toFixed(1)}% ${dhashPassed ? '≥' : '<'} ${(thresholds.dhashSimilarity * 100).toFixed(0)}%`;

      bgColorClass = dhashPassed ? 'bg-green-100' : 'bg-red-100';
      textColorClass = dhashPassed ? 'text-green-800' : 'text-red-800';

      if (dhashPassed && dhashSimilarity < thresholds.suspiciousSimilarity) {
        tooltipText = `Hybrid Mode: Camera Feed (DHash)\nSimilarity: ${(dhashSimilarity * 100).toFixed(2)}%\nThreshold: ${(thresholds.dhashSimilarity * 100).toFixed(0)}%\nDecision: Camera noise/lighting variations ignored\nAction: Model skipped`;
      } else {
        tooltipText = `Hybrid Mode: Camera Feed (DHash)\nSimilarity: ${(dhashSimilarity * 100).toFixed(2)}%\nThreshold: ${(thresholds.dhashSimilarity * 100).toFixed(0)}%\nDecision: Significant change detected\nAction: Model ran`;
      }
    }
  }

  // If no display text was built, don't render (edge case)
  if (!displayText) {
    return null;
  }

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium ${bgColorClass} ${textColorClass} ml-1`}
      title={tooltipText}
    >
      <IconComponent className="w-3.5 h-3.5" />
      <span className="font-mono">{displayText}</span>
    </div>
  );
};

// --- Main Component: Renders pills for all images ---
const ChangeDetectionIndicator: React.FC<ChangeDetectionIndicatorProps> = ({ data }) => {
  // Don't render anything for first iteration
  if (data.isFirstIteration) {
    return null;
  }

  // Don't render if no image details (no images to compare)
  if (!data.imageDetails || data.imageDetails.length === 0) {
    return null;
  }

  return (
    <>
      {data.imageDetails.map((details, index) => (
        <ImagePill
          key={index}
          details={details}
          thresholds={data.thresholds}
          detectionMode={data.detectionMode}
        />
      ))}
    </>
  );
};

export default ChangeDetectionIndicator;
