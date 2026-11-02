import { parseDocument } from "../markdown/parse";

function dataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * `resolveImage` with the images it serves from beside the document read
 * into data URLs, for a page that can't reach the document's folder: the
 * window a PDF is printed in shows no document. Web images stay links, and
 * an image that can't be read keeps its URL.
 */
export async function embeddingImages(text: string, resolveImage: (src: string) => string): Promise<(src: string) => string> {
  const served = new Map<string, string>();
  parseDocument(text, {
    resolveImage(src) {
      const url = resolveImage(src);
      if (url !== src && !url.startsWith("data:")) served.set(src, url);
      return url;
    },
  });
  const embedded = new Map<string, string>();
  await Promise.all(
    [...served].map(async ([src, url]) => {
      try {
        const res = await fetch(url);
        if (res.ok) embedded.set(src, await dataURL(await res.blob()));
      } catch (e) {
        console.error("image not embedded", src, e);
      }
    }),
  );
  return (src) => embedded.get(src) ?? resolveImage(src);
}
