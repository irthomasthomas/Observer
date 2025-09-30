// src/utils/change_detector.ts

import { PreProcessorResult } from './pre-processor';
import { Logger } from './logging';

// Store previous iteration data for comparison
const previousIterationData = new Map<string, PreProcessorResult>();

// Configurable thresholds
const TEXT_SIMILARITY_THRESHOLD = 0.95; // 95% similar = no significant change
const IMAGE_SIMILARITY_THRESHOLD = 0.95; // 95% similar = no significant change

/**
 * Detect if there's a significant change from the previous iteration
 * Returns true if change is significant (should run model)
 * Returns false if no significant change (skip iteration)
 */
export async function detectSignificantChange(
  agentId: string,
  currentData: PreProcessorResult
): Promise<boolean> {
  const previous = previousIterationData.get(agentId);

  // First run always counts as significant
  if (!previous) {
    Logger.debug(agentId, 'First iteration - storing baseline data');
    previousIterationData.set(agentId, currentData);
    return true;
  }

  // Compare text using Levenshtein
  const isSameText = compareText(previous.modifiedPrompt, currentData.modifiedPrompt);

  // Compare images using dhash
  Logger.debug(agentId, `Starting image comparison. Previous: ${previous.images?.length || 0} images, Current: ${currentData.images?.length || 0} images`);

  const isSameImages = await compareImages(
    agentId,
    previous.images || [],
    currentData.images || []
  );

  Logger.debug(agentId, `Change detection: text=${isSameText ? 'same' : 'changed'}, images=${isSameImages ? 'same' : 'changed'}`);

  // Only skip if BOTH text AND images are the same
  const isSignificant = !isSameText || !isSameImages;

  // Store current data for next comparison if significant
  if (isSignificant) {
    previousIterationData.set(agentId, currentData);
  }

  return isSignificant;
}

/**
 * Compare text using Levenshtein distance
 * Returns true if texts are similar enough (no significant change)
 */
function compareText(text1: string, text2: string): boolean {
  if (text1 === text2) return true;

  const similarity = calculateLevenshteinSimilarity(text1, text2);
  return similarity >= TEXT_SIMILARITY_THRESHOLD;
}

/**
 * Calculate Levenshtein similarity ratio (0-1, where 1 is identical)
 */
function calculateLevenshteinSimilarity(str1: string, str2: string): number {
  const distance = levenshteinDistance(str1, str2);
  const maxLength = Math.max(str1.length, str2.length);

  if (maxLength === 0) return 1.0;

  return 1 - (distance / maxLength);
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;

  // Create 2D array for dynamic programming
  const matrix: number[][] = Array(len1 + 1)
    .fill(null)
    .map(() => Array(len2 + 1).fill(0));

  // Initialize first column and row
  for (let i = 0; i <= len1; i++) matrix[i][0] = i;
  for (let j = 0; j <= len2; j++) matrix[0][j] = j;

  // Fill in the rest of the matrix
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[len1][len2];
}

/**
 * Compare images using dhash (difference hash)
 * Returns true if images are similar enough (no significant change)
 */
async function compareImages(agentId: string, images1: string[], images2: string[]): Promise<boolean> {
  // If both have no images, they're the same
  if (images1.length === 0 && images2.length === 0) {
    Logger.debug(agentId, 'No images to compare - considered same');
    return true;
  }

  // If different number of images, they're different
  if (images1.length !== images2.length) {
    Logger.debug(agentId, `Different number of images: ${images1.length} vs ${images2.length} - considered different`);
    return false;
  }

  // Compare each image pair
  for (let i = 0; i < images1.length; i++) {
    Logger.debug(agentId, `Comparing image pair ${i + 1}/${images1.length}`);
    Logger.debug(agentId, `Image 1 prefix: ${images1[i].substring(0, 50)}...`);
    Logger.debug(agentId, `Image 1 length: ${images1[i].length} chars`);
    Logger.debug(agentId, `Image 2 prefix: ${images2[i].substring(0, 50)}...`);
    Logger.debug(agentId, `Image 2 length: ${images2[i].length} chars`);

    try {
      const hash1 = await calculateDHash(agentId, images1[i], `previous-${i}`);
      const hash2 = await calculateDHash(agentId, images2[i], `current-${i}`);

      const similarity = compareHashes(hash1, hash2);
      Logger.debug(agentId, `Image ${i + 1} similarity: ${(similarity * 100).toFixed(2)}% (threshold: ${IMAGE_SIMILARITY_THRESHOLD * 100}%)`);

      // If any image pair is significantly different, return false
      if (similarity < IMAGE_SIMILARITY_THRESHOLD) {
        Logger.debug(agentId, `Image ${i + 1} below threshold - considered different`);
        return false;
      }
    } catch (error) {
      Logger.error(agentId, `Error comparing image ${i + 1}: ${error}`);
      // On error, assume different to be safe
      return false;
    }
  }

  Logger.debug(agentId, 'All images above threshold - considered same');
  return true;
}

/**
 * Calculate difference hash (dhash) for an image
 * Returns a 64-bit hash as a string
 */
async function calculateDHash(agentId: string, base64Image: string, label: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      try {
        Logger.debug(agentId, `Image ${label} loaded successfully (${img.width}x${img.height})`);

        // Create canvas for image processing
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }

        // Resize to 9x8 for dhash (handles different sizes gracefully)
        const width = 9;
        const height = 8;
        canvas.width = width;
        canvas.height = height;

        // Draw image scaled to 9x8
        ctx.drawImage(img, 0, 0, width, height);

        // Get pixel data
        const imageData = ctx.getImageData(0, 0, width, height);
        const pixels = imageData.data;

        // Convert to grayscale and build hash
        let hash = '';
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width - 1; x++) {
            const idx1 = (y * width + x) * 4;
            const idx2 = (y * width + (x + 1)) * 4;

            // Convert to grayscale
            const gray1 = pixels[idx1] * 0.299 + pixels[idx1 + 1] * 0.587 + pixels[idx1 + 2] * 0.114;
            const gray2 = pixels[idx2] * 0.299 + pixels[idx2 + 1] * 0.587 + pixels[idx2 + 2] * 0.114;

            // Compare adjacent pixels
            hash += gray1 > gray2 ? '1' : '0';
          }
        }

        Logger.debug(agentId, `Image ${label} hash calculated: ${hash.substring(0, 16)}...`);
        resolve(hash);
      } catch (error) {
        Logger.error(agentId, `Error processing image ${label}: ${error}`);
        reject(error);
      }
    };

    img.onerror = (event) => {
      Logger.error(agentId, `Failed to load image ${label}`);
      Logger.error(agentId, `Error event: ${JSON.stringify(event)}`);
      Logger.error(agentId, `Image src starts with: ${base64Image.substring(0, 100)}`);
      reject(new Error(`Failed to load image ${label}`));
    };

    Logger.debug(agentId, `Starting to load image ${label}...`);

    // Ensure proper data URI format
    if (base64Image.startsWith('data:')) {
      img.src = base64Image;
    } else {
      // Base64 string without data URI prefix - add it
      img.src = `data:image/png;base64,${base64Image}`;
      Logger.debug(agentId, `Added data URI prefix to image ${label}`);
    }
  });
}

/**
 * Compare two dhash strings using Hamming distance
 * Returns similarity ratio (0-1, where 1 is identical)
 */
function compareHashes(hash1: string, hash2: string): number {
  if (hash1.length !== hash2.length) return 0;

  let differences = 0;
  for (let i = 0; i < hash1.length; i++) {
    if (hash1[i] !== hash2[i]) differences++;
  }

  const similarity = 1 - (differences / hash1.length);
  return similarity;
}

/**
 * Clear stored data for an agent (call when agent stops)
 */
export function clearAgentChangeData(agentId: string): void {
  previousIterationData.delete(agentId);
  Logger.debug(agentId, 'Cleared change detection data');
}

/**
 * Get current thresholds (for debugging/testing)
 */
export function getThresholds() {
  return {
    textSimilarity: TEXT_SIMILARITY_THRESHOLD,
    imageSimilarity: IMAGE_SIMILARITY_THRESHOLD
  };
}
