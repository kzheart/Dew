import { expect, test } from "bun:test";
import { docFileURL } from "./docFile";

test("a path in the document's folder maps to docfile://", () => {
  expect(docFileURL("./assets/paste-20261102-143012.png")).toBe("docfile://localhost/assets/paste-20261102-143012.png");
  expect(docFileURL("img/a/../%E7%8C%AB.png?raw#x")).toBe("docfile://localhost/img/%E7%8C%AB.png");
});

test("URLs, absolute paths and paths out of the folder are left alone", () => {
  expect(docFileURL("https://example.com/a.png")).toBeNull();
  expect(docFileURL("data:image/png;base64,AAAA")).toBeNull();
  expect(docFileURL("//cdn.example.com/a.png")).toBeNull();
  expect(docFileURL("/Users/ada/a.png")).toBeNull();
  expect(docFileURL("../shared/a.png")).toBeNull();
  expect(docFileURL("assets/../../a.png")).toBeNull();
});
