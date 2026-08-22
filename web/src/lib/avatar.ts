/**
 * Shrink an uploaded image into a small square avatar data-URI. Client-side so
 * the server only ever stores a capped `data:image/*` string (avatarUrlSchema).
 */
export async function fileToAvatarDataUrl(file: File, size = 256): Promise<string> {
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('canvas unavailable');
    // Cover-crop: scale the shorter side to `size`, center the overflow.
    const scale = size / Math.min(bitmap.width, bitmap.height);
    const width = bitmap.width * scale;
    const height = bitmap.height * scale;
    context.drawImage(bitmap, (size - width) / 2, (size - height) / 2, width, height);
    // Browsers without webp encoding fall back to png automatically — both
    // pass the server's data:image/* validation.
    const dataUrl = canvas.toDataURL('image/webp', 0.85);
    if (dataUrl.length > 2_000_000) throw new Error('That image is too large even after shrinking');
    return dataUrl;
  } finally {
    bitmap.close();
  }
}
