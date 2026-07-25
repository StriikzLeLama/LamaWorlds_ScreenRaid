const COMPRESSIBLE = new Set(['image/jpeg', 'image/png', 'image/webp']);
const SIZE_THRESHOLD_BYTES = 1.5 * 1024 * 1024;
const MAX_EDGE = 1920;
const QUALITY = 0.82;
const MIN_SAVINGS_RATIO = 0.1;

export interface CompressImageResult {
  file: File;
  originalBytes: number;
  compressedBytes: number;
  compressed: boolean;
}

function readImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read image dimensions'));
    };
    img.src = url;
  });
}

function scaledSize(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

/** Downscale heavy JPEG/PNG/WebP before upload; skip GIF/video/audio. */
export async function maybeCompressImage(file: File): Promise<CompressImageResult> {
  const originalBytes = file.size;
  if (!COMPRESSIBLE.has(file.type)) {
    return { file, originalBytes, compressedBytes: originalBytes, compressed: false };
  }

  let dims: { width: number; height: number };
  try {
    dims = await readImageDimensions(file);
  } catch {
    return { file, originalBytes, compressedBytes: originalBytes, compressed: false };
  }

  const needsCompress =
    file.size > SIZE_THRESHOLD_BYTES || dims.width > MAX_EDGE || dims.height > MAX_EDGE;
  if (!needsCompress) {
    return { file, originalBytes, compressedBytes: originalBytes, compressed: false };
  }

  const target = scaledSize(dims.width, dims.height, MAX_EDGE);
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Image decode failed'));
      el.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = target.width;
    canvas.height = target.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return { file, originalBytes, compressedBytes: originalBytes, compressed: false };
    }
    ctx.drawImage(img, 0, 0, target.width, target.height);

    let outType = 'image/webp';
    let blob = await canvasToBlob(canvas, outType, QUALITY);
    if (!blob || blob.size >= originalBytes * (1 - MIN_SAVINGS_RATIO)) {
      outType = 'image/jpeg';
      blob = await canvasToBlob(canvas, outType, QUALITY);
    }
    if (!blob || blob.size >= originalBytes * (1 - MIN_SAVINGS_RATIO)) {
      return { file, originalBytes, compressedBytes: originalBytes, compressed: false };
    }

    const ext = outType === 'image/webp' ? '.webp' : '.jpg';
    const baseName = file.name.replace(/\.[^.]+$/, '') || 'image';
    const outFile = new File([blob], `${baseName}${ext}`, {
      type: outType,
      lastModified: Date.now(),
    });

    return {
      file: outFile,
      originalBytes,
      compressedBytes: outFile.size,
      compressed: true,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function formatCompressionNote(
  originalBytes: number,
  compressedBytes: number,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string | null {
  if (compressedBytes >= originalBytes * (1 - MIN_SAVINGS_RATIO)) return null;
  const fmt = (n: number) =>
    n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return t('compress.saved', { from: fmt(originalBytes), to: fmt(compressedBytes) });
}
