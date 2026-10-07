import type { ToastKind } from "../player/PlayerController";
import { el } from "./dom";

/** Shows short messages in the corner of the screen. */
export class ToastHost {
  public readonly element = el("div", {
    className: "toast-host",
    attrs: { "aria-live": "polite", role: "status" },
  });

  public show(message: string, kind: ToastKind = "info"): void {
    const toast = el("div", { className: `toast toast-${kind}`, text: message });
    this.element.append(toast);
    window.setTimeout(() => {
      toast.classList.add("toast-leaving");
      window.setTimeout(() => toast.remove(), 300);
    }, 4200);
  }
}
