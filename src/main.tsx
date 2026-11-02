import "katex/dist/katex.min.css";
import "./styles/app.css";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { Welcome } from "./app/Welcome";
import { defaultPrefs } from "./defaultPrefs";
import { host } from "./platform";
import { pageOf } from "./state/page";

const root = createRoot(document.getElementById("root")!);
const prefs = host.prefs.get().catch(() => defaultPrefs);

switch (pageOf(location.search)) {
  case "welcome":
    root.render(<Welcome prefs={await prefs} />);
    break;
  case "document": {
    const [text, state, files, resume] = await Promise.all([
      host.doc.content(),
      host.doc.state(),
      host.files.list(),
      host.recent.resume().catch(() => 0),
    ]);
    root.render(<App initial={{ text, state, prefs: await prefs, files, resume }} />);
    break;
  }
}
