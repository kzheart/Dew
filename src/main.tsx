import "katex/dist/katex.min.css";
import "./styles/app.css";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { defaultPrefs } from "./defaultPrefs";
import { host } from "./platform";

const [text, state, prefs, files, resume] = await Promise.all([
  host.doc.content(),
  host.doc.state(),
  host.prefs.get().catch(() => defaultPrefs),
  host.files.list(),
  host.recent.resume().catch(() => 0),
]);

createRoot(document.getElementById("root")!).render(<App initial={{ text, state, prefs, files, resume }} />);
