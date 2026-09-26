const SCRIPT_ID = "cloudflare-turnstile-script";
const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type TurnstileApi = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    const script = existing ?? document.createElement("script");

    const onLoad = () => {
      if (window.turnstile) resolve(window.turnstile);
      else reject(new Error("Turnstile did not initialize"));
    };
    const onError = () => reject(new Error("Не удалось загрузить проверку безопасности"));

    script.addEventListener("load", onLoad, { once: true });
    script.addEventListener("error", onError, { once: true });

    if (!existing) {
      script.id = SCRIPT_ID;
      script.src = SCRIPT_URL;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
  });

  return scriptPromise;
}

export async function requestTurnstileToken(sitekey: string): Promise<string> {
  const turnstile = await loadTurnstile();

  return new Promise((resolve, reject) => {
    const overlay = document.createElement("div");
    overlay.className = "turnstile-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Проверка безопасности");

    const panel = document.createElement("div");
    panel.className = "turnstile-overlay__panel";
    const message = document.createElement("p");
    message.textContent = "Подтвердите, что запрос отправляет человек";
    const container = document.createElement("div");
    panel.append(message, container);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    let widgetId = "";
    let settled = false;
    const cleanup = () => {
      if (widgetId) turnstile.remove(widgetId);
      overlay.remove();
    };
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      cleanup();
      callback();
    };
    const timeoutId = window.setTimeout(
      () => finish(() => reject(new Error("Время проверки истекло. Попробуйте ещё раз."))),
      120_000,
    );

    widgetId = turnstile.render(container, {
      sitekey,
      action: "public_search",
      theme: "auto",
      language: "ru",
      callback: (token: string) => finish(() => resolve(token)),
      "error-callback": () => finish(() => reject(new Error("Проверка безопасности не выполнена"))),
      "expired-callback": () => finish(() => reject(new Error("Время проверки истекло. Попробуйте ещё раз."))),
    });
  });
}

