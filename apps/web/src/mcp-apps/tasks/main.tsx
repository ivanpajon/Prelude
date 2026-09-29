import { createRoot } from "react-dom/client";
import { TaskApp } from "./app";
import { readTools } from "./model";

const root = document.getElementById("root");
if (!root) throw new Error("The task app could not start.");
const reactRoot = createRoot(root);
try {
  const config = JSON.parse(
    document.getElementById("prelude-mcp-app-config")?.textContent ?? "null",
  );
  reactRoot.render(<TaskApp tools={readTools(config)} />);
} catch {
  reactRoot.render(
    <p role="alert">The task app configuration is unavailable. Reopen this widget to try again.</p>,
  );
}
