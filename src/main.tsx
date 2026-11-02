import "katex/dist/katex.min.css";
import "./styles/app.css";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { defaultPrefs, host } from "./platform";

const [text, state, prefs] = await Promise.all([
  host.doc.content(),
  host.doc.state(),
  host.prefs.get().catch(() => defaultPrefs),
]);

createRoot(document.getElementById("root")!).render(<App initial={{ text, state, prefs }} />);
