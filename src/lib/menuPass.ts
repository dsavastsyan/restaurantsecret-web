// Разовый доступ к меню одного ресторана на 24 часа (письмо с предложением).
// Пропуск привязан к аккаунту; сервер сам отдаёт полные данные меню по пропуску,
// здесь мы только узнаём, действует ли он, чтобы снять замки в интерфейсе.
import { apiGet } from "@/lib/api";

export type MenuPassStatus = { active: boolean; expiresAt: string | null };

export async function fetchMenuPass(slug: string, token: string): Promise<MenuPassStatus> {
  const response = await apiGet<{ active?: boolean; expires_at?: string | null }>(
    `/api/menu-pass/${encodeURIComponent(slug)}`,
    token,
  );
  return { active: Boolean(response?.active), expiresAt: response?.expires_at || null };
}

/** «21:08» в часовом поясе устройства. */
export function formatPassUntil(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}
