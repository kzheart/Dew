import { expect, test } from "bun:test";
import { deflateRawSync } from "node:zlib";
import { plantumlBase64, plantumlUrl } from "./plantumlEncode";

test("deflated source encodes to the URL PlantUML's own docs give for it", () => {
  const deflated = deflateRawSync("@startuml\nBob -> Alice : hello\n@enduml");
  expect(plantumlUrl(deflated)).toBe("https://www.plantuml.com/plantuml/svg/SoWkIImgAStDuNBAJrBGjLDmpCbCJbMmKiX8pSd9vt98pKifpSq10000");
  expect(plantumlBase64(deflateRawSync("Bob -> Alice : hello"))).toBe("SyfFKj2rKt3CoKnELR1Io4ZDoSa70000");
});

test("a short last group fills with zero bits and the alphabet ends in - and _", () => {
  expect(plantumlBase64(new Uint8Array([0xff]))).toBe("_m00");
  expect(plantumlBase64(new Uint8Array([0xfb, 0xef, 0xbe]))).toBe("----");
  expect(plantumlBase64(new Uint8Array([]))).toBe("");
});
