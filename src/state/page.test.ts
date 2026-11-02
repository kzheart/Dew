import { expect, test } from "bun:test";
import { pageOf } from "./page";

test("the welcome window's URL routes to the welcome page, any other to the document", () => {
  expect(pageOf("?page=welcome")).toBe("welcome");
  expect(pageOf("")).toBe("document");
  expect(pageOf("?doc=超级代码块")).toBe("document");
});
