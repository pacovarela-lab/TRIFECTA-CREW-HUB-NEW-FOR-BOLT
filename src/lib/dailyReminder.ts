export const DEFAULT_REMINDER_TIME = "19:00";
export const REMINDER_MESSAGE = "¿Terminaste por hoy? 🚛 Toma una foto de tus recibos o usa la voz para registrar los pagos de hoy en 1 minuto.";

export type ReminderState = {
  enabled: boolean;
  time: string;
  permission: NotificationPermission | "unsupported";
};

export function normalizeTime(time: string): string {
  if (!time) return DEFAULT_REMINDER_TIME;
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return DEFAULT_REMINDER_TIME;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h < 0 || h > 23 || m < 0 || m > 59) return DEFAULT_REMINDER_TIME;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function shouldSendReminder(
  enabled: boolean,
  reminderTime: string,
  now: Date = new Date(),
): boolean {
  if (!enabled) return false;
  if (!reminderTime) return false;
  const [h, m] = reminderTime.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return false;
  return now.getHours() === h && now.getMinutes() === m;
}

export function permissionLabel(permission: NotificationPermission | "unsupported"): string {
  switch (permission) {
    case "granted": return "Permitido";
    case "denied": return "Bloqueado";
    case "default": return "Sin preguntar";
    case "unsupported": return "No soportado";
  }
}
