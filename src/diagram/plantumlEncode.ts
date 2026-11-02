const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_";

/** PlantUML's base64: its own alphabet, no padding, a short last group filled with zero bits. */
export function plantumlBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b1 = bytes[i]!;
    const b2 = bytes[i + 1] ?? 0;
    const b3 = bytes[i + 2] ?? 0;
    out += ALPHABET[b1 >> 2]! + ALPHABET[((b1 & 0x3) << 4) | (b2 >> 4)]! + ALPHABET[((b2 & 0xf) << 2) | (b3 >> 6)]! + ALPHABET[b3 & 0x3f]!;
  }
  return out;
}

export const PLANTUML_SERVER = "https://www.plantuml.com/plantuml/svg/";

/** The server URL that renders source, given its raw deflate. */
export function plantumlUrl(deflated: Uint8Array): string {
  return PLANTUML_SERVER + plantumlBase64(deflated);
}
