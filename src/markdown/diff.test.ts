import { expect, test } from "bun:test";
import { parseDiff } from "./diff";

// The artboard's diff of src/sync.ts.
const artboard = `@@ -12,7 +12,9 @@ export function sync
 export function sync(src: Pane, view: Pane) {
-  const ratio = view.height / src.height;
+  const map = buildBlockMap(src.doc);
   view.onScroll((y) => {
-    src.scrollTo(y / ratio);
+    const line = map.toSource(y);
+    src.scrollTo(line);
   });
+  return () => view.offScroll();
 }`;

test("the artboard's diff numbers its old and new columns as drawn and counts +4 −2", () => {
  const d = parseDiff(artboard);
  expect(d.lines.map((l) => [l.type, l.old, l.new])).toEqual([
    ["hunk", null, null],
    ["context", 12, 12],
    ["del", 13, null],
    ["add", null, 13],
    ["context", 14, 14],
    ["del", 15, null],
    ["add", null, 15],
    ["add", null, 16],
    ["context", 16, 17],
    ["add", null, 18],
    ["context", 17, 19],
  ]);
  expect([d.added, d.removed]).toEqual([4, 2]);
  expect(d.lines[0]!.text).toBe("@@ -12,7 +12,9 @@ export function sync");
  expect(d.lines[2]!.text).toBe("  const ratio = view.height / src.height;");
  expect(d.lines[1]!.text).toBe("export function sync(src: Pane, view: Pane) {");
});

test("file headers are meta, not a deletion and an addition", () => {
  const d = parseDiff("diff --git a/x.ts b/x.ts\nindex 1a2b..3c4d 100644\n--- a/x.ts\n+++ b/x.ts\n@@ -1,2 +1,2 @@\n-a\n+b\n c");
  expect(d.lines.map((l) => l.type)).toEqual(["meta", "meta", "meta", "meta", "hunk", "del", "add", "context"]);
  expect([d.added, d.removed]).toEqual([1, 1]);
});

test("inside a hunk a removed line that starts with dashes is still removed", () => {
  const d = parseDiff("@@ -1,2 +1,1 @@\n--- old rule\n keep");
  expect(d.lines.map((l) => [l.type, l.old, l.new, l.text])).toEqual([
    ["hunk", null, null, "@@ -1,2 +1,1 @@"],
    ["del", 1, null, "-- old rule"],
    ["context", 2, 1, "keep"],
  ]);
});

test("a second file's headers after the first hunk ends are meta again", () => {
  const d = parseDiff("@@ -1 +1 @@\n-a\n+b\n--- a/y\n+++ b/y\n@@ -5,1 +5,1 @@\n-c\n+d");
  expect(d.lines.map((l) => [l.type, l.old, l.new])).toEqual([
    ["hunk", null, null],
    ["del", 1, null],
    ["add", null, 1],
    ["meta", null, null],
    ["meta", null, null],
    ["hunk", null, null],
    ["del", 5, null],
    ["add", null, 5],
  ]);
});

test("a diff without a header numbers both sides from 1", () => {
  const d = parseDiff(" one\n-two\n+deux\n three\n\\ No newline at end of file");
  expect(d.lines.map((l) => [l.type, l.old, l.new])).toEqual([
    ["context", 1, 1],
    ["del", 2, null],
    ["add", null, 2],
    ["context", 3, 3],
    ["meta", null, null],
  ]);
});
