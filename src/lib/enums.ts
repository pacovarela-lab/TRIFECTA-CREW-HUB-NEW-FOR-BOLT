import type { Database } from "@/integrations/supabase/types";

export type ProjectType = Database["public"]["Enums"]["project_type"];
export type ProjectStatus = Database["public"]["Enums"]["project_status"];
export type TaskStatus = Database["public"]["Enums"]["task_status"];
export type TaskPriority = Database["public"]["Enums"]["task_priority"];
export type PaymentMethod = Database["public"]["Enums"]["payment_method"];
export type ReceiptStatus = Database["public"]["Enums"]["receipt_status"];

export const RECEIPT_STATUSES: { value: ReceiptStatus; label: string; tone: "default" | "warning" | "info" | "success" | "destructive" }[] = [
  { value: "uploaded", label: "Subido", tone: "default" },
  { value: "needs_review", label: "Requiere revisión", tone: "warning" },
  { value: "linked_to_project", label: "Vinculado a trabajo", tone: "info" },
  { value: "ready_to_convert", label: "Listo para convertir", tone: "info" },
  { value: "converted_to_expense", label: "Convertido en gasto", tone: "success" },
  { value: "rejected", label: "Rechazado", tone: "destructive" },
];

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: "Efectivo" },
  { value: "check", label: "Cheque" },
  { value: "card", label: "Tarjeta" },
  { value: "ach", label: "ACH / Banco" },
  { value: "zelle", label: "Zelle" },
  { value: "venmo", label: "Venmo" },
  { value: "other", label: "Otro" },
];

export const PROJECT_TYPES: { value: ProjectType; label: string }[] = [
  { value: "bathroom_remodel", label: "Remodelación de baño" },
  { value: "kitchen_remodel", label: "Remodelación de cocina" },
  { value: "painting", label: "Pintura" },
  { value: "drywall", label: "Tablaroca" },
  { value: "flooring", label: "Pisos" },
  { value: "roof", label: "Techo" },
  { value: "landscaping", label: "Jardinería" },
  { value: "junk_removal", label: "Retiro de escombro" },
  { value: "general_handyman", label: "Mantenimiento general" },
  { value: "other", label: "Otro" },
];

export const PROJECT_STATUSES: { value: ProjectStatus; label: string }[] = [
  { value: "draft", label: "Borrador" },
  { value: "active", label: "Activo" },
  { value: "on_hold", label: "En pausa" },
  { value: "completed", label: "Completado" },
  { value: "cancelled", label: "Cancelado" },
];

// "Not Started" maps to enum "pending"
export const TASK_STATUSES: { value: TaskStatus; label: string }[] = [
  { value: "pending", label: "Sin empezar" },
  { value: "in_progress", label: "En proceso" },
  { value: "completed", label: "Completado" },
  { value: "blocked", label: "Bloqueado" },
  { value: "overdue", label: "Atrasado" },
  { value: "cancelled", label: "Cancelado" },
];

export const TASK_PRIORITIES: { value: TaskPriority; label: string }[] = [
  { value: "low", label: "Baja" },
  { value: "medium", label: "Media" },
  { value: "high", label: "Alta" },
  { value: "urgent", label: "Urgente" },
];

export type TaskPhase = "demolition" | "plumbing" | "electrical" | "structure_drywall" | "finishes_paint" | "inspection_permits";

export const TASK_PHASES: { value: TaskPhase; label: string }[] = [
  { value: "demolition", label: "Demolición" },
  { value: "plumbing", label: "Plomería" },
  { value: "electrical", label: "Electricidad" },
  { value: "structure_drywall", label: "Estructura / Drywall" },
  { value: "finishes_paint", label: "Acabados / Pintura" },
  { value: "inspection_permits", label: "Inspección / Permisos" },
];
