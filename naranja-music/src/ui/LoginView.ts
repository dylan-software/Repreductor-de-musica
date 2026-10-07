import { AuthError, type AuthService, type AuthUser } from "../services/AuthService";
import { clearChildren, el } from "./dom";

type Mode = "login" | "register";

/** Sign in / create account screen. */
export class LoginView {
  private mode: Mode = "login";
  private container: HTMLElement | null = null;

  constructor(
    private readonly auth: AuthService,
    private readonly onAuthenticated: (user: AuthUser) => void,
  ) {}

  public mount(container: HTMLElement): void {
    this.container = container;
    this.render();
  }

  private render(): void {
    if (this.container === null) {
      return;
    }
    clearChildren(this.container);
    const isRegister = this.mode === "register";

    const errorBox = el("p", { className: "form-error", attrs: { role: "alert" } });
    const username = el("input", {
      className: "field",
      attrs: {
        type: "text",
        name: "username",
        placeholder: "Username",
        autocomplete: "username",
        maxlength: "24",
        required: "",
        "aria-label": "Username",
      },
    });
    const password = el("input", {
      className: "field",
      attrs: {
        type: "password",
        name: "password",
        placeholder: "Password",
        autocomplete: isRegister ? "new-password" : "current-password",
        required: "",
        "aria-label": "Password",
      },
    });
    const confirm = el("input", {
      className: "field",
      attrs: {
        type: "password",
        name: "confirm",
        placeholder: "Repeat password",
        autocomplete: "new-password",
        required: "",
        "aria-label": "Repeat password",
      },
    });
    const submit = el("button", {
      className: "btn primary wide",
      text: isRegister ? "Create account" : "Sign in",
      attrs: { type: "submit" },
    });

    const form = el(
      "form",
      {
        className: "login-form",
        attrs: { novalidate: "" },
        on: {
          submit: (event: Event) => {
            event.preventDefault();
            void this.submit(username.value, password.value, confirm.value, errorBox, submit);
          },
        },
      },
      username,
      password,
      isRegister ? confirm : null,
      errorBox,
      submit,
    );

    const switchLink = el("button", {
      className: "link-button",
      text: isRegister ? "I already have an account" : "Create a new account",
      attrs: { type: "button" },
      on: {
        click: () => {
          this.mode = isRegister ? "login" : "register";
          this.render();
        },
      },
    });

    const card = el(
      "div",
      { className: "login-card" },
      el("img", {
        className: "login-logo",
        attrs: { src: "./logo.png", alt: "Naranja Music logo", width: "132", height: "132" },
      }),
      el("h1", { className: "login-title", text: "Naranja Music" }),
      el("p", {
        className: "login-subtitle",
        text: isRegister ? "Create your account to start your playlist" : "Sign in to open your music",
      }),
      form,
      switchLink,
    );

    this.container.append(el("main", { className: "login-screen" }, card));
    username.focus();
  }

  private async submit(
    name: string,
    password: string,
    confirm: string,
    errorBox: HTMLElement,
    button: HTMLButtonElement,
  ): Promise<void> {
    errorBox.textContent = "";
    if (this.mode === "register" && password !== confirm) {
      errorBox.textContent = "Passwords do not match.";
      return;
    }
    button.disabled = true;
    try {
      const user =
        this.mode === "register"
          ? await this.auth.register(name, password)
          : await this.auth.login(name, password);
      this.onAuthenticated(user);
    } catch (error) {
      errorBox.textContent =
        error instanceof AuthError ? error.message : "Something went wrong. Please try again.";
      button.disabled = false;
    }
  }
}
