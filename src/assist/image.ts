/** The image a paste carries, as a file or as a file item, whichever the webview offers. */
export function imageFile(data: DataTransfer): File | null {
  const file = [...data.files].find((f) => f.type.startsWith("image/"));
  if (file) return file;
  const item = [...data.items].find((i) => i.kind === "file" && i.type.startsWith("image/"));
  return item?.getAsFile() ?? null;
}

const STORED: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" };

function base64Of(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).slice(String(reader.result).indexOf(",") + 1));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** The image's bytes in base64 and its extension; types a page can't count on (TIFF, BMP) are redrawn as PNG. */
export async function encodeImage(file: Blob): Promise<{ base64: string; ext: string }> {
  const ext = STORED[file.type];
  if (ext) return { base64: await base64Of(file), ext };
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
  const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("the image could not be redrawn"))), "image/png"));
  return { base64: await base64Of(png), ext: "png" };
}
