/**
 * Center-crop and downscale an uploaded photo to a small square JPEG data URL,
 * so driver photos stay a few tens of KB when stored and sent to the clerk.
 */
export async function photoToDataUrl(file: File, size = 320): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file.");
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not process the image.");
  ctx.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    size,
    size,
  );
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.85);
}
