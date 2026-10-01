import { describe, it, expect } from "vitest";
import {
  DEFAULT_REMINDER_TIME,
  REMINDER_MESSAGE,
  normalizeTime,
  shouldSendReminder,
  permissionLabel,
} from "@/lib/dailyReminder";

describe("Recordatorio diario — activar/desactivar", () => {
  it("no programa cuando está desactivado", () => {
    expect(shouldSendReminder(false, "19:00", new Date("2026-01-01T19:00:00"))).toBe(false);
  });

  it("programa cuando está activado y la hora coincide", () => {
    expect(shouldSendReminder(true, "19:00", new Date("2026-01-01T19:00:00"))).toBe(true);
  });

  it("no programa cuando está activado pero la hora no coincide", () => {
    expect(shouldSendReminder(true, "19:00", new Date("2026-01-01T18:00:00"))).toBe(false);
    expect(shouldSendReminder(true, "19:00", new Date("2026-01-01T19:01:00"))).toBe(false);
  });
});

describe("Recordatorio diario — guardar hora", () => {
  it("normaliza hora válida", () => {
    expect(normalizeTime("19:00")).toBe("19:00");
    expect(normalizeTime("7:00")).toBe("07:00");
    expect(normalizeTime("07:05")).toBe("07:05");
  });

  it("usa hora por defecto si el formato es inválido", () => {
    expect(normalizeTime("")).toBe(DEFAULT_REMINDER_TIME);
    expect(normalizeTime("invalid")).toBe(DEFAULT_REMINDER_TIME);
    expect(normalizeTime("25:00")).toBe(DEFAULT_REMINDER_TIME);
    expect(normalizeTime("12:60")).toBe(DEFAULT_REMINDER_TIME);
  });
});

describe("Recordatorio diario — hora por defecto", () => {
  it("el valor por defecto es 19:00 (7:00 PM)", () => {
    expect(DEFAULT_REMINDER_TIME).toBe("19:00");
  });

  it("el mensaje contiene el texto correcto", () => {
    expect(REMINDER_MESSAGE).toContain("¿Terminaste por hoy?");
    expect(REMINDER_MESSAGE).toContain("🚛");
    expect(REMINDER_MESSAGE).toContain("recibos");
    expect(REMINDER_MESSAGE).toContain("voz");
  });
});

describe("Recordatorio diario — estado de permiso", () => {
  it("etiqueta de permiso concedido", () => {
    expect(permissionLabel("granted")).toBe("Permitido");
  });

  it("etiqueta de permiso denegado", () => {
    expect(permissionLabel("denied")).toBe("Bloqueado");
  });

  it("etiqueta de permiso sin preguntar", () => {
    expect(permissionLabel("default")).toBe("Sin preguntar");
  });

  it("etiqueta de no soportado", () => {
    expect(permissionLabel("unsupported")).toBe("No soportado");
  });
});

describe("Recordatorio diario — no programar cuando desactivado", () => {
  it("no envía si enabled=false sin importar la hora", () => {
    for (let h = 0; h < 24; h++) {
      const time = `${String(h).padStart(2, "0")}:00`;
      const now = new Date(2026, 0, 1, h, 0);
      expect(shouldSendReminder(false, time, now)).toBe(false);
    }
  });

  it("no envía si reminderTime está vacío", () => {
    expect(shouldSendReminder(true, "", new Date())).toBe(false);
  });

  it("no envía si reminderTime es inválido", () => {
    expect(shouldSendReminder(true, "abc", new Date())).toBe(false);
  });
});
