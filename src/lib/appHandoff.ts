// Передача входа из приложения на сайт (страница /auth/handoff).
// Документ и модель угроз: product/solutions/onboarding/features/app-web-handoff.md.

// Страницы, куда может привести передача. Сервер сам присылает путь по цели кода,
// а сайт ещё раз сверяет его с этим списком: произвольного адреса возврата нет.
export const HANDOFF_NEXT_PATHS = ["/account/subscription"] as const;
export const HANDOFF_DEFAULT_PATH = "/account/subscription";

export function safeHandoffNext(value: unknown): string {
  return typeof value === "string" && (HANDOFF_NEXT_PATHS as readonly string[]).includes(value)
    ? value
    : HANDOFF_DEFAULT_PATH;
}

const CODE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

declare global {
  interface Window {
    // Заполняется встроенным скриптом в index.html ещё до загрузки аналитики.
    __rsHandoff?: { code: string | null };
  }
}

/**
 * Достаёт код из фрагмента адреса и стирает его оттуда. Встроенный скрипт index.html
 * делает это раньше всего остального; здесь запасной путь (например, в dev-режиме).
 */
export function takeHandoffCode(win: Window = window): string | null {
  let code: string | null = null;
  const prepared = win.__rsHandoff;
  if (prepared) {
    code = prepared.code;
    prepared.code = null;
  } else {
    const match = /(?:^#|&)code=([^&]*)/.exec(win.location.hash || "");
    code = match ? decodeURIComponent(match[1]) : null;
  }
  try {
    if (win.location.hash) {
      win.history.replaceState(null, "", win.location.pathname + win.location.search);
    }
  } catch {
    /* ignore */
  }
  return code && CODE_PATTERN.test(code) ? code : null;
}

export function maskEmail(email: string | null | undefined): string {
  const value = String(email || "").trim();
  const at = value.indexOf("@");
  if (at < 1) return "";
  return `${value[0]}***${value.slice(at)}`;
}
