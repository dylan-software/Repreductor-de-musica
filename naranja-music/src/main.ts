import "./styles.css";
import { App } from "./App";

const root = document.getElementById("app");
if (root === null) {
  throw new Error("Missing #app element");
}

// Ask the browser not to evict the saved songs when the disk is running low.
void navigator.storage?.persist?.();

void new App(root).start();
