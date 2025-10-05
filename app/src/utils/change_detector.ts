import { PreProcessorResult } from './pre-processor';
import { Logger } from './logging';

// Store previous iteration data for comparison
const previousIterationData = new Map<string, PreProcessorResult>();

// --- NEW: Configurable Detection Modes ---

/**
 * Defines the available image comparison strategies.
 * - DHashOnly: Fast, good for camera feeds. "Detect Mainly Camera Changes"
 * - PixelDifferenceOnly: Precise, good for UI testing. "Detect Mainly UI Changes"
 * - Hybrid: A smart combination of both.
 */
export enum DetectionMode {
  DHashOnly = "Detect Mainly Camera Changes",
  PixelDifferenceOnly = "Detect Mainly UI Changes",
  Hybrid = "Hybrid",
}

// The current mode for the change detector, defaults to Hybrid.
let currentDetectionMode: DetectionMode = DetectionMode.Hybrid;

/**
 * Sets the active image change detection mode.
 * @param mode The detection mode to use.
 */
export function setChangeDetectionMode(mode: DetectionMode): void {
  Logger.debug('CHANGE_DETECTOR', `Setting change detection mode to: ${mode}`);
  currentDetectionMode = mode;
}

// --- THRESHOLDS ---

let TEXT_SIMILARITY_THRESHOLD = 0.90; // 95% similar = no significant change
let IMAGE_DHASH_SIMILARITY_THRESHOLD = 0.90; // 95% similar = no significant change for dhash
let SUSPICIOUS_SIMILARITY_THRESHOLD = 0.998; // at what dhash similarity do we do pixel-wise check
let PIXEL_SIMILARITY_THRESHOLD = 0.95; // 95.0% pixel-perfect = no significant change

/**
 * Sets the text similarity threshold.
 */
export function setTextSimilarityThreshold(threshold: number): void {
  TEXT_SIMILARITY_THRESHOLD = Math.max(0, Math.min(1, threshold));
  Logger.debug('CHANGE_DETECTOR', `Text similarity threshold set to: ${TEXT_SIMILARITY_THRESHOLD}`);
}

/**
 * Sets the dhash similarity threshold.
 */
export function setDHashSimilarityThreshold(threshold: number): void {
  IMAGE_DHASH_SIMILARITY_THRESHOLD = Math.max(0, Math.min(1, threshold));
  Logger.debug('CHANGE_DETECTOR', `DHash similarity threshold set to: ${IMAGE_DHASH_SIMILARITY_THRESHOLD}`);
}

/**
 * Sets the suspicious similarity threshold (when to trigger pixel check in Hybrid mode).
 */
export function setSuspiciousSimilarityThreshold(threshold: number): void {
  SUSPICIOUS_SIMILARITY_THRESHOLD = Math.max(0, Math.min(1, threshold));
  Logger.debug('CHANGE_DETECTOR', `Suspicious similarity threshold set to: ${SUSPICIOUS_SIMILARITY_THRESHOLD}`);
}

/**
 * Sets the pixel difference similarity threshold.
 */
export function setPixelSimilarityThreshold(threshold: number): void {
  PIXEL_SIMILARITY_THRESHOLD = Math.max(0, Math.min(1, threshold));
  Logger.debug('CHANGE_DETECTOR', `Pixel similarity threshold set to: ${PIXEL_SIMILARITY_THRESHOLD}`);
}

/**
 * Gets the current detection mode.
 */
export function getChangeDetectionMode(): DetectionMode {
  return currentDetectionMode;
}

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
    Logger.debug('CHANGE_DETECTOR', 'First iteration - storing baseline data');
    previousIterationData.set(agentId, currentData);
    return true;
  }

  // Compare text using Levenshtein
  const isSameText = compareText(previous.modifiedPrompt, currentData.modifiedPrompt);

  // Compare images using the configured strategy
  Logger.debug('CHANGE_DETECTOR', `Starting image comparison with mode: "${currentDetectionMode}"`);
  const isSameImages = await compareImages(
    previous.images || [],
    currentData.images || []
  );

  Logger.debug('CHANGE_DETECTOR', `Change detection: text=${isSameText ? 'same' : 'changed'}, images=${isSameImages ? 'same' : 'changed'}`);

  // Only skip if BOTH text AND images are the same
  const isSignificant = !isSameText || !isSameImages;

  // Store current data for next comparison if significant
  if (isSignificant) {
    previousIterationData.set(agentId, currentData);
  }

  return isSignificant;
}

// --- Text Comparison ---
function compareText(text1: string, text2: string): boolean {
  if (text1 === text2) return true;
  const similarity = calculateLevenshteinSimilarity(text1, text2);
  return similarity >= TEXT_SIMILARITY_THRESHOLD;
}
function calculateLevenshteinSimilarity(str1: string, str2: string): number {
  const distance = levenshteinDistance(str1, str2);
  const maxLength = Math.max(str1.length, str2.length);
  if (maxLength === 0) return 1.0;
  return 1 - (distance / maxLength);
}
function levenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix: number[][] = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(0));
  for (let i = 0; i <= len1; i++) matrix[i][0] = i;
  for (let j = 0; j <= len2; j++) matrix[0][j] = j;
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost);
    }
  }
  return matrix[len1][len2];
}

/**
 * Reusable utility to load an image from a base64 string.
 * Handles the data URI prefix automatically.
 */
async function loadImage(base64Image: string, label: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (event) => {
      Logger.error("CHANGE_DETECTOR", `Failed to load image ${label}. Error event: ${JSON.stringify(event)}`);
      reject(new Error(`Failed to load image ${label}`));
    };

    if (base64Image.startsWith('data:')) {
      img.src = base64Image;
    } else {
      img.src = `data:image/png;base64,${base64Image}`;
    }
  });
}

/**
 * Compares two images pixel by pixel for exact differences.
 * Returns true if they are similar enough based on PIXEL_SIMILARITY_THRESHOLD.
 */
async function compareImagesByPixelDifference(
  base64Image1: string,
  base64Image2: string,
  imageIndex: number
): Promise<boolean> {
  Logger.debug('CHANGE_DETECTOR', `Performing high-precision pixel difference check for image ${imageIndex + 1}`);
  try {
    const [img1, img2] = await Promise.all([
      loadImage(base64Image1, `pixel-prev-${imageIndex}`),
      loadImage(base64Image2, `pixel-curr-${imageIndex}`),
    ]);

    if (img1.width !== img2.width || img1.height !== img2.height) {
      Logger.warn('CHANGE_DETECTOR', `Pixel diff: Image dimensions mismatch (${img1.width}x${img1.height} vs ${img2.width}x${img2.height}) - considered different`);
      return false;
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Could not get canvas context');
    canvas.width = img1.width;
    canvas.height = img1.height;

    ctx.drawImage(img1, 0, 0);
    const imageData1 = ctx.getImageData(0, 0, img1.width, img1.height).data;

    ctx.drawImage(img2, 0, 0);
    const imageData2 = ctx.getImageData(0, 0, img2.width, img2.height).data;

    const totalPixels = img1.width * img1.height;
    let differentPixels = 0;
    for (let i = 0; i < imageData1.length; i += 4) {
      if (
        imageData1[i] !== imageData2[i] ||
        imageData1[i + 1] !== imageData2[i + 1] ||
        imageData1[i + 2] !== imageData2[i + 2] ||
        imageData1[i + 3] !== imageData2[i + 3]
      ) {
        differentPixels++;
      }
    }

    const similarity = 1 - (differentPixels / totalPixels);
    Logger.info('CHANGE_DETECTOR', `Pixel diff similarity: ${(similarity * 100).toFixed(4)}% (threshold: ${PIXEL_SIMILARITY_THRESHOLD * 100}%)`);
    return similarity >= PIXEL_SIMILARITY_THRESHOLD;
  } catch (error) {
    Logger.error('CHANGE_DETECTOR', `Error during pixel difference comparison: ${error}`);
    return false; // Assume different on error
  }
}

// --- REWRITTEN: Main Image Comparison Router ---

/**
 * Compares images based on the currently selected detection mode.
 * Returns true if images are considered the same, false otherwise.
 */
async function compareImages(images1: string[], images2: string[]): Promise<boolean> {
  if (images1.length !== images2.length) {
    Logger.debug("CHANGE_DETECTOR", `Different number of images: ${images1.length} vs ${images2.length} - considered different`);
    return false;
  }
  if (images1.length === 0) {
    Logger.debug("CHANGE_DETECTOR", 'No images to compare - considered same');
    return true;
  }

  for (let i = 0; i < images1.length; i++) {
    let isPairTheSame: boolean;
    try {
      switch (currentDetectionMode) {
        case DetectionMode.PixelDifferenceOnly:
          isPairTheSame = await compareImagesByPixelDifference(images1[i], images2[i], i);
          break;

        case DetectionMode.DHashOnly:
          const hash1_d = await calculateDHash(images1[i], `dhash-prev-${i}`);
          const hash2_d = await calculateDHash(images2[i], `dhash-curr-${i}`);
          if (isInvalidHash(hash1_d) || isInvalidHash(hash2_d)) {
             Logger.warn("CHANGE_DETECTOR", `Invalid hash in DHashOnly mode - considered different.`);
             isPairTheSame = false;
          } else {
            const similarity = compareHashes(hash1_d, hash2_d);
            Logger.debug("CHANGE_DETECTOR", `DHashOnly similarity: ${(similarity * 100).toFixed(2)}%`);
            isPairTheSame = similarity >= IMAGE_DHASH_SIMILARITY_THRESHOLD;
          }
          break;

        case DetectionMode.Hybrid:
        default:
          const hash1_h = await calculateDHash(images1[i], `hybrid-prev-${i}`);
          const hash2_h = await calculateDHash(images2[i], `hybrid-curr-${i}`);

          if (isInvalidHash(hash1_h) || isInvalidHash(hash2_h)) {
            Logger.warn("CHANGE_DETECTOR", `Invalid dhash detected in Hybrid mode. Falling back to pixel check.`);
            isPairTheSame = await compareImagesByPixelDifference(images1[i], images2[i], i);
          } else {
            const dhashSimilarity = compareHashes(hash1_h, hash2_h);
            Logger.info("CHANGE_DETECTOR", `Hybrid dhash similarity: ${(dhashSimilarity * 100).toFixed(2)}%`);

            if (dhashSimilarity < IMAGE_DHASH_SIMILARITY_THRESHOLD) { // e.g. < 95%
              Logger.debug("CHANGE_DETECTOR", `Hybrid: DHash similarity is low - considered different.`);
              isPairTheSame = false; // Clearly different
            } else if (dhashSimilarity < SUSPICIOUS_SIMILARITY_THRESHOLD) { // e.g. 95% - 99.8%
              Logger.debug("CHANGE_DETECTOR", `Hybrid: DHash in noise-zone - considered same.`);
              isPairTheSame = true; // Broadly the same (camera noise)
            } else { // e.g. >= 99.8% (suspiciously perfect match)
              Logger.debug("CHANGE_DETECTOR", `Hybrid: DHash is nearly identical. Triggering pixel check for UI changes.`);
              isPairTheSame = await compareImagesByPixelDifference(images1[i], images2[i], i);
            }
          }
          break;
      }
    } catch (error) {
        Logger.error("CHANGE_DETECTOR", `Error comparing image pair ${i + 1}: ${error}`);
        isPairTheSame = false; // On any error, assume change
    }

    if (!isPairTheSame) {
      Logger.debug("CHANGE_DETECTOR", `Image pair ${i + 1} determined to be different. Stopping comparison.`);
      return false; // A single different pair makes the whole set different
    }
  }

  Logger.debug("CHANGE_DETECTOR", 'All image pairs were determined to be the same.');
  return true;
}


// --- DHash Implementation ---

async function calculateDHash(base64Image: string, label: string): Promise<string> {
  const img = await loadImage(base64Image, label);

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get canvas context for dhash');

  const width = 9;
  const height = 8;
  canvas.width = width;
  canvas.height = height;
  ctx.drawImage(img, 0, 0, width, height);

  const imageData = ctx.getImageData(0, 0, width, height);
  const pixels = imageData.data;
  let hash = '';
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width - 1; x++) {
      const idx1 = (y * width + x) * 4;
      const idx2 = (y * width + (x + 1)) * 4;
      const gray1 = pixels[idx1] * 0.299 + pixels[idx1 + 1] * 0.587 + pixels[idx1 + 2] * 0.114;
      const gray2 = pixels[idx2] * 0.299 + pixels[idx2 + 1] * 0.587 + pixels[idx2 + 2] * 0.114;
      hash += gray1 > gray2 ? '1' : '0';
    }
  }
  Logger.debug("CHANGE_DETECTOR", `Image ${label} hash calculated: ${hash.substring(0, 16)}...`);
  return hash;
}

function isInvalidHash(hash: string): boolean {
  return hash === '0'.repeat(hash.length) || hash === '1'.repeat(hash.length);
}

function compareHashes(hash1: string, hash2: string): number {
  if (hash1.length !== hash2.length) return 0;
  let differences = 0;
  for (let i = 0; i < hash1.length; i++) {
    if (hash1[i] !== hash2[i]) differences++;
  }
  return 1 - (differences / hash1.length);
}


// --- Utility Functions ---

export function clearAgentChangeData(agentId: string): void {
  previousIterationData.delete(agentId);
  Logger.debug("CHANGE_DETECTOR", 'Cleared change detection data');
}

export function getThresholds() {
  return {
    textSimilarity: TEXT_SIMILARITY_THRESHOLD,
    dhashImageSimilarity: IMAGE_DHASH_SIMILARITY_THRESHOLD,
    suspiciousSimilarity: SUSPICIOUS_SIMILARITY_THRESHOLD,
    pixelImageSimilarity: PIXEL_SIMILARITY_THRESHOLD,
  };
}
