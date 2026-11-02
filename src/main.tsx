import { createRoot } from "react-dom/client";
import { Doc } from "./mygo";

const text = await Doc.content();
createRoot(document.getElementById("root")!).render(
  <textarea defaultValue={text} onChange={(e) => Doc.setContent(e.target.value)} style={{ width: "100%", height: "100vh" }} />,
);
