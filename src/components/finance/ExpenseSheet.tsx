/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Switch } from "@/components/ui/switch";
import {
  useProjects, useDivisions, useVendors, useCategories,
  useCreateVendor, useCreateCategory,
  useCreateExpense, useUpdateExpense,
  useReceipts, useUploadReceipt, getReceiptMimeType,
} from "@/hooks/useTrifectaData";
import { ReceiptUploader } from "@/components/receipts/ReceiptUploader";
import { WorkerPicker } from "@/components/workers/WorkerPicker";
import { Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { expenseEditStartsUnassigned, getExpenseIssueKinds, getExpenseReviewSaveAction, formatIssueKind, type ExpenseIssueKind } from "@/lib/expenseReview";
import { plausibleReceiptDate, normalizeReceiptDate } from "@/lib/date-normalize";
import { useVendorSuggestion, useRecordVendorPattern } from "@/hooks/useVendorPattern";
import { findDuplicateReceipt } from "@/hooks/useDuplicateReceipt";
import { sha256File } from "@/lib/fileHash";
import { extractReceiptText } from "@/lib/receiptText";
import { AlertTriangle } from "lucide-react";
import { SaveExpenseRuleDialog } from "@/components/finance/SaveExpenseRuleDialog";
import { ExpenseRuleDraft } from "@/lib/expenseRules";
import { ExpenseTraceability } from "@/components/finance/ExpenseTraceability";
import { diffExpense, logExpenseAudit } from "@/lib/expenseAudit";
import { isGasCategory, computeGasProration } from "@/lib/gasProration";

function FutureDateWarning({ value, onFix }: { value: string; onFix: (d: string) => void }) {
  if (!value) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  const picked = new Date(y, m - 1, d);
  if (picked <= today) return null;
  // Try swap day/month
  let swapped: string | null = null;
  if (d >= 1 && d <= 12 && m >= 1 && m <= 31) {
    const cand = new Date(y, d - 1, m);
    if (cand <= today && cand.getMonth() === d - 1 && cand.getDate() === m) {
      swapped = `${y}-${String(d).padStart(2, "0")}-${String(m).padStart(2, "0")}`;
    }
  }
  return (
    <div className="mt-2 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs">
      <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
      <div className="flex-1">
        <div className="font-medium text-amber-700 dark:text-amber-400">Fecha futura detectada</div>
        <div className="text-muted-foreground">
          {swapped ? `¿Quisiste decir ${swapped}? (día/mes intercambiados)` : "Verifica la fecha ingresada."}
        </div>
      </div>
      {swapped && (
        <Button type="button" size="sm" variant="outline" className="h-7" onClick={() => onFix(swapped!)}>
          Corregir
        </Button>
      )}
    </div>
  );
}


const schema = z.object({
  unassigned: z.boolean(),
  project_id: z.string().nullable(),
  division_id: z.string().min(1, "La división es obligatoria"),
  vendor_id: z.string().nullable(),
  category_id: z.string().min(1, "La categoría es obligatoria"),
  worker_id: z.string().nullable(),
  amount: z.number().positive("El monto debe ser mayor a 0"),
  spent_on: z.string().min(1, "La fecha es obligatoria"),
  description: z.string().max(500).optional().nullable(),
}).refine((v) => v.unassigned || !!v.project_id, {
  message: "El proyecto es obligatorio a menos que se marque como Sin asignar",
  path: ["project_id"],
});

interface InitialValues {
  amount?: number;
  spent_on?: string;
  description?: string | null;
  category_id?: string | null;
  new_category?: string;
  vendor_id?: string | null;
  new_vendor?: string;
  project_id?: string | null;
  unassigned?: boolean;
  division_id?: string;
  worker_id?: string | null;
  bank_transaction_id?: string;
  voice_review?: {
    transcript: string;
    needs_review: string[];
    warnings: string[];
    confidences: Record<string, number>;
    subcategory?: string | null;
    payment_method?: string | null;
  };
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  expense?: any | null;
  defaultProjectId?: string;
  initialValues?: InitialValues | null;
  onReviewVerified?: (result: { id: string; issues: ExpenseIssueKind[] }) => void;
}

export function ExpenseSheet({ open, onOpenChange, expense, defaultProjectId, initialValues, onReviewVerified }: Props) {
  const isEdit = !!expense;
  const { data: projects } = useProjects();
  const { data: divisions } = useDivisions();
  const { data: vendors } = useVendors();
  const { data: categories } = useCategories("expense");
  const createVendor = useCreateVendor();
  const createCategory = useCreateCategory();
  const createExpense = useCreateExpense();
  const updateExpense = useUpdateExpense();
  const uploadReceipt = useUploadReceipt();
  const qc = useQueryClient();
  const { data: existingReceipts } = useReceipts({ expenseId: expense?.id });
  const currentReceipt = existingReceipts?.[0] ?? null;
  const [ruleDraft, setRuleDraft] = useState<ExpenseRuleDraft | null>(null);
  const [serverReviewIssues, setServerReviewIssues] = useState<ExpenseIssueKind[]>([]);

  type DetectedFields = {
    amount?: number | null;
    spent_on?: string | null;
    vendor?: string | null;
    category?: string | null;
    description?: string | null;
  };
  type PendingItem = {
    id: string;
    file: File;
    status: "pending" | "extracting" | "done" | "failed";
    attempt: number;
    detected: DetectedFields | null;
  };

  const MAX_RECEIPTS = 5;
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([]);
  const [consolidate, setConsolidate] = useState(false);
  const [reviewMode, setReviewMode] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("expense.aiReviewMode") === "1";
  });
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("expense.aiReviewMode", reviewMode ? "1" : "0");
    }
  }, [reviewMode]);
  // Pending field-level proposals awaiting user confirmation (only used when reviewMode is on)
  type PendingProposal = {
    field: "amount" | "spent_on" | "vendor" | "category" | "description";
    label: string;
    currentDisplay: string;
    proposedDisplay: string;
    apply: () => void;
  };
  const [proposals, setProposals] = useState<PendingProposal[]>([]);
  const queueProposal = (p: PendingProposal) =>
    setProposals((curr) => [...curr.filter((x) => x.field !== p.field), p]);
  const acceptProposal = (field: PendingProposal["field"]) => {
    setProposals((curr) => {
      const target = curr.find((p) => p.field === field);
      if (target) target.apply();
      return curr.filter((p) => p.field !== field);
    });
  };
  const rejectProposal = (field: PendingProposal["field"]) =>
    setProposals((curr) => curr.filter((p) => p.field !== field));
  const acceptAllProposals = () => {
    setProposals((curr) => {
      curr.forEach((p) => p.apply());
      return [];
    });
  };
  const rejectAllProposals = () => setProposals([]);
  // Legacy single-file states retained for the existing UI (driven by first item)
  const pendingFile = pendingItems[0]?.file ?? null;
  const extractingPending = pendingItems.some((it) => it.status === "extracting");
  const extractAttempt = pendingItems[0]?.attempt ?? 0;
  const extractFailed = pendingItems.some((it) => it.status === "failed");
  const lastDetected = pendingItems[0]?.detected ?? null;

  const fileToDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(file);
    });

  // Apply detected fields to the visible form (only first/primary receipt does this).
  // Returns the normalized DetectedFields for storage.
  const applyParsed = (p: any): DetectedFields | null => {
    if (!p) return null;
    let normalizedDate: string | null = null;
    if (p.spent_on) normalizedDate = plausibleReceiptDate(p.spent_on);
    if (p.spent_on && !normalizedDate) {
      console.warn("Ignoring unparseable receipt date:", p.spent_on);
      toast.warning("No se pudo interpretar la fecha del recibo. Verifícala antes de guardar.");
    }

    // Resolve vendor proposal (existing match or new vendor name)
    const vendorMatch = p.vendor
      ? (vendors ?? []).find((v: any) => v.name.toLowerCase() === p.vendor.toLowerCase())
      : null;
    const applyVendor = () => {
      if (!p.vendor) return;
      if (vendorMatch) { setVendorId(vendorMatch.id); setNewVendor(""); }
      else { setNewVendor(p.vendor); setVendorId(null); }
    };

    const categoryMatch = p.category
      ? (categories ?? []).find((c: any) => c.name.toLowerCase() === p.category.toLowerCase())
      : null;
    const applyCategory = () => {
      if (!p.category) return;
      if (categoryMatch) { setCategoryId(categoryMatch.id); setNewCategory(""); }
      else { setNewCategory(p.category); setCategoryId(""); }
    };

    // Helper: should we just write, or queue a proposal?
    // - If reviewMode is OFF → preserve old behavior (only fill empty fields).
    // - If reviewMode is ON → ANY detected value with content shows for confirmation.
    //   When current is empty, still propose so user explicitly accepts (one tap).
    const handleField = (
      hasDetected: boolean,
      currentEmpty: boolean,
      wouldChange: boolean,
      proposal: Omit<PendingProposal, "apply"> & { apply: () => void },
    ) => {
      if (!hasDetected) return;
      if (!reviewMode) {
        // Legacy: only fill if empty
        if (currentEmpty) proposal.apply();
        return;
      }
      // Review mode: nothing to do if value already matches
      if (!wouldChange) return;
      queueProposal(proposal);
    };

    // Amount
    handleField(
      !!p.amount,
      !amount,
      String(p.amount ?? "") !== amount,
      {
        field: "amount",
        label: "Monto",
        currentDisplay: amount ? `$${amount}` : "(vacío)",
        proposedDisplay: `$${p.amount}`,
        apply: () => setAmount(String(p.amount)),
      },
    );

    // Date
    handleField(
      !!normalizedDate,
      !spentOn,
      normalizedDate !== spentOn,
      {
        field: "spent_on",
        label: "Fecha",
        currentDisplay: spentOn || "(vacío)",
        proposedDisplay: normalizedDate ?? "",
        apply: () => normalizedDate && setSpentOn(normalizedDate),
      },
    );

    // Description
    handleField(
      !!p.description,
      !description,
      p.description !== description,
      {
        field: "description",
        label: "Descripción",
        currentDisplay: description || "(vacío)",
        proposedDisplay: p.description ?? "",
        apply: () => setDescription(p.description),
      },
    );

    // Vendor
    const currentVendorEmpty = !vendorId && !newVendor;
    const currentVendorName =
      newVendor || (vendors ?? []).find((v: any) => v.id === vendorId)?.name || "";
    const proposedVendorName = vendorMatch?.name ?? p.vendor ?? "";
    handleField(
      !!p.vendor,
      currentVendorEmpty,
      proposedVendorName.toLowerCase() !== currentVendorName.toLowerCase(),
      {
        field: "vendor",
        label: "Proveedor",
        currentDisplay: currentVendorName || "(vacío)",
        proposedDisplay: proposedVendorName + (vendorMatch ? "" : " (nuevo)"),
        apply: applyVendor,
      },
    );

    // Category
    const currentCategoryEmpty = !categoryId && !newCategory;
    const currentCategoryName =
      newCategory || (categories ?? []).find((c: any) => c.id === categoryId)?.name || "";
    const proposedCategoryName = categoryMatch?.name ?? p.category ?? "";
    handleField(
      !!p.category,
      currentCategoryEmpty,
      proposedCategoryName.toLowerCase() !== currentCategoryName.toLowerCase(),
      {
        field: "category",
        label: "Categoría",
        currentDisplay: currentCategoryName || "(vacío)",
        proposedDisplay: proposedCategoryName + (categoryMatch ? "" : " (nueva)"),
        apply: applyCategory,
      },
    );

    return {
      amount: p.amount ?? null,
      spent_on: normalizedDate,
      vendor: p.vendor ?? null,
      category: p.category ?? null,
      description: p.description ?? null,
    };
  };

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const updateItem = (id: string, patch: Partial<PendingItem>) =>
    setPendingItems((curr) => curr.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  // Extract OCR data from one pending item. The first item also drives the form.
  const extractFromItem = async (
    itemId: string,
    {
      silent = false,
      applyToForm = true,
      file: fileOverride,
    }: { silent?: boolean; applyToForm?: boolean; file?: File } = {},
  ) => {
    const file = fileOverride ?? pendingItems.find((it) => it.id === itemId)?.file;
    if (!file) return;
    updateItem(itemId, { status: "extracting", attempt: 0 });
    const maxAttempts = 3;
    try {
      const dataUrl = await fileToDataUrl(file);
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        updateItem(itemId, { attempt });
        try {
          const ocrText = await extractReceiptText(file).catch(() => "");
          const { data, error } = await supabase.functions.invoke("process-receipt", {
            body: { fileDataUrl: dataUrl, ocrText },
          });
          if (error) throw error;
          let detected: DetectedFields | null = null;
          if (applyToForm) {
            detected = applyParsed(data);
          } else {
            const normDate = data?.spent_on ? plausibleReceiptDate(data.spent_on) : null;
            detected = {
              amount: data?.amount ?? null,
              spent_on: normDate,
              vendor: data?.vendor ?? null,
              category: data?.category ?? null,
              description: data?.description ?? null,
            };
          }
          updateItem(itemId, { status: "done", attempt: 0, detected });
          if ((data as any)?.amount && applyToForm) {
            toast.success(`Detectado: $${(data as any).amount}${(data as any).vendor ? ` · ${(data as any).vendor}` : ""}`);
          }
          return;
        } catch (e) {
          console.warn(`OCR extract failed (attempt ${attempt}/${maxAttempts})`, e);
          if (attempt < maxAttempts) await sleep(1000 * attempt);
        }
      }
      updateItem(itemId, { status: "failed", attempt: 0 });
      if (!silent) {
        toast.error("No se pudo leer el recibo. Toca Reintentar o completa manualmente.");
      }
    } catch (e) {
      console.warn("Receipt read error", e);
      updateItem(itemId, { status: "failed", attempt: 0 });
    }
  };

  // Backwards-compatible name used by ReceiptUploader (edit mode)
  const extractFromPending = async (_file: File) => {
    const first = pendingItems[0];
    if (first) await extractFromItem(first.id);
  };

  const addPendingFiles = async (files: File[]) => {
    if (!files.length) return;
    const { prepareReceiptFile, isHeicLike } = await import("@/lib/imagePrep");
    const accepted: PendingItem[] = [];
    for (const raw of files) {
      if (pendingItems.length + accepted.length >= MAX_RECEIPTS) {
        toast.warning(`Máximo ${MAX_RECEIPTS} recibos por gasto.`);
        break;
      }
      const mt = getReceiptMimeType(raw);
      if (!["image/jpeg", "image/png", "image/heic", "application/pdf"].includes(mt)) {
        toast.error(`"${raw.name}": solo JPG, PNG, HEIC o PDF`);
        continue;
      }
      if (raw.size > 10 * 1024 * 1024) {
        toast.error(`"${raw.name}" supera 10 MB`);
        continue;
      }
      const f = await prepareReceiptFile(raw);
      if (isHeicLike(raw) && !isHeicLike(f)) toast.message(`"${raw.name}" HEIC → JPG`);
      accepted.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        file: f,
        status: "pending",
        attempt: 0,
        detected: null,
      });
    }
    if (!accepted.length) return;
    // Verificar duplicados por hash en paralelo (no bloquea el flujo, solo avisa)
    void Promise.all(
      accepted.map(async (it) => {
        try {
          const h = await sha256File(it.file);
          const dup = await findDuplicateReceipt({ hash: h });
          if (dup) {
            toast.warning(`⚠️ "${it.file.name}" parece duplicado de un recibo ya cargado`);
          }
        } catch { /* ignore */ }
      }),
    );
    const wasEmpty = pendingItems.length === 0;
    setPendingItems((curr) => [...curr, ...accepted]);
    // Trigger extraction sequentially; first added item drives the form when list was empty
    queueMicrotask(async () => {
      for (let i = 0; i < accepted.length; i++) {
        const isFirst = wasEmpty && i === 0;
        await extractFromItem(accepted[i].id, {
          applyToForm: isFirst,
          silent: !isFirst,
          file: accepted[i].file,
        });
      }
    });
  };

  const removePendingItem = (id: string) =>
    setPendingItems((curr) => curr.filter((it) => it.id !== id));

  const [unassigned, setUnassigned] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [divisionId, setDivisionId] = useState<string>("");
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string>("");
  const [workerId, setWorkerId] = useState<string | null>(null);
  const [amount, setAmount] = useState<string>("");
  const [spentOn, setSpentOn] = useState<string>(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState<string>("");
  const [newVendor, setNewVendor] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [isOverhead, setIsOverhead] = useState(false);
  const [gasProrate, setGasProrate] = useState(false);
  const [gasProrationNote, setGasProrationNote] = useState<string | null>(null);
  const [gasProrationError, setGasProrationError] = useState<string | null>(null);
  const [voiceSubcategory, setVoiceSubcategory] = useState("");
  const [voicePaymentMethod, setVoicePaymentMethod] = useState("");
  // Shared/split expenses across multiple projects
  type SplitRow = { id: string; project_id: string; amount: string };
  const [splits, setSplits] = useState<SplitRow[]>([]);
  const addSplit = () =>
    setSplits((s) => [...s, { id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, project_id: "", amount: "" }]);
  const updateSplit = (id: string, patch: Partial<SplitRow>) =>
    setSplits((s) => s.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const removeSplit = (id: string) => setSplits((s) => s.filter((r) => r.id !== id));
  const splitTotal = splits.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  const splitAuto = () => {
    const total = Number(amount) || 0;
    const n = splits.length;
    if (!total || !n) return;
    const each = +(total / n).toFixed(2);
    let acc = 0;
    setSplits((s) =>
      s.map((r, i) => {
        const v = i === n - 1 ? +(total - acc).toFixed(2) : each;
        acc += each;
        return { ...r, amount: String(v) };
      }),
    );
  };
  // Auto-suggest "Unassigned" when category is General Expenses (shared/overhead)
  useEffect(() => {
    if (isEdit) return;
    const cat = (categories ?? []).find((c: any) => c.id === categoryId);
    if (cat && /general\s*expenses/i.test(cat.name) && !unassigned && !projectId) {
      setUnassigned(true);
    }
  }, [categoryId, categories, isEdit]);

  // Detect gas/vehicle category and auto-suggest proration
  const selectedCategoryName = (categories ?? []).find((c: any) => c.id === categoryId)?.name ?? null;
  const isGasExpense = isGasCategory(selectedCategoryName) || isGasCategory(newCategory);

  useEffect(() => {
    if (!gasProrate) return;
    if (!isGasExpense) { setGasProrate(false); return; }
    const total = Number(amount) || 0;
    if (!total) { setGasProrationError("Ingresa el monto del gasto para calcular el prorrateo."); setGasProrationNote(null); return; }
    const activeProjects = (projects ?? []).filter((p: any) =>
      p.status === "active" || p.status === "in_progress",
    ).map((p: any) => ({ id: p.id, name: p.name, estimated_total: p.estimated_total }));
    const { splits: gasSplits, error } = computeGasProration(total, activeProjects);
    if (error) {
      setGasProrationError(error);
      setGasProrationNote(null);
      setSplits([]);
      return;
    }
    setGasProrationError(null);
    setSplits(gasSplits.map((s) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${s.project_id}`,
      project_id: s.project_id,
      amount: String(s.amount),
    })));
    const totalContracts = activeProjects.reduce((sum, p) => sum + Number(p.estimated_total ?? 0), 0);
    setGasProrationNote(`Prorrateo de gasolina (${gasSplits[0]?.percentage ?? 0}%–${gasSplits[gasSplits.length - 1]?.percentage ?? 0}% según tamaño del contrato: ${totalContracts.toLocaleString()})`);
  }, [gasProrate, isGasExpense, amount, projects]);

  useEffect(() => {
    if (!open) return;
    if (expense) {
      setUnassigned(expenseEditStartsUnassigned(expense));
      setProjectId(expense.project_id ?? null);
      setDivisionId(expense.division_id ?? "");
      setVendorId(expense.vendor_id ?? null);
      setCategoryId(expense.category_id ?? "");
      setWorkerId(expense.worker_id ?? null);
      setAmount(String(expense.amount ?? ""));
      setSpentOn(expense.spent_on ?? new Date().toISOString().slice(0, 10));
      setDescription(expense.description ?? "");
      setIsOverhead(!!expense.is_overhead);
      setVoiceSubcategory("");
      setVoicePaymentMethod("");
    } else if (initialValues) {
      setUnassigned(initialValues.unassigned ?? !initialValues.project_id);
      setProjectId(initialValues.project_id ?? null);
      setDivisionId(initialValues.division_id ?? "");
      setVendorId(initialValues.vendor_id ?? null);
      setCategoryId(initialValues.category_id ?? "");
      setWorkerId(initialValues.worker_id ?? null);
      setAmount(initialValues.amount != null ? String(initialValues.amount) : "");
      setSpentOn(initialValues.spent_on ?? new Date().toISOString().slice(0, 10));
      setDescription(initialValues.description ?? "");
      setNewVendor(initialValues.new_vendor ?? "");
      setNewCategory(initialValues.new_category ?? "");
      setIsOverhead(false);
      setVoiceSubcategory(initialValues.voice_review?.subcategory ?? "");
      setVoicePaymentMethod(initialValues.voice_review?.payment_method ?? "");
    } else {
      setUnassigned(false);
      setProjectId(defaultProjectId ?? null);
      setDivisionId("");
      setVendorId(null);
      setCategoryId("");
      setWorkerId(null);
      setAmount("");
      setSpentOn(new Date().toISOString().slice(0, 10));
      setDescription("");
      setNewVendor("");
      setNewCategory("");
      setIsOverhead(false);
      setVoiceSubcategory("");
      setVoicePaymentMethod("");
    }
    setPendingItems([]);
    setConsolidate(false);
    setProposals([]);
    setSplits([]);
    setGasProrate(false);
    setGasProrationNote(null);
    setGasProrationError(null);
    setServerReviewIssues([]);
  }, [open, expense, defaultProjectId, initialValues]);

  // Inherit division from project
  useEffect(() => {
    if (unassigned) return;
    if (!projectId || !projects) return;
    const p = projects.find((x: any) => x.id === projectId);
    if (p && p.division_id) setDivisionId(p.division_id);
  }, [projectId, projects, unassigned]);

  // Aprendizaje: aplicar sugerencia de categoría/proyecto al elegir vendor (solo en creación)
  const { data: vendorSuggestion } = useVendorSuggestion(vendorId);
  const recordPattern = useRecordVendorPattern();
  useEffect(() => {
    if (isEdit || !vendorSuggestion || !vendorId) return;
    if (!categoryId && vendorSuggestion.category_id) {
      setCategoryId(vendorSuggestion.category_id);
      toast.info("💡 Categoría sugerida según historial de este proveedor");
    }
    if (!projectId && !unassigned && vendorSuggestion.project_id) {
      setProjectId(vendorSuggestion.project_id);
    }
  }, [vendorSuggestion, vendorId, isEdit]);

  const submitting = createExpense.isPending || updateExpense.isPending;

  const liveReviewIssues = isEdit
    ? getExpenseIssueKinds({
        ...expense,
        project_id: unassigned ? null : projectId,
        category_id: categoryId || null,
        worker_id: workerId,
        spent_on: spentOn,
        description: description || null,
        is_overhead: unassigned ? isOverhead : false,
        categories: categoryId
          ? { name: (categories ?? []).find((c: any) => c.id === categoryId)?.name ?? "" }
          : null,
        vendors: vendorId
          ? { name: (vendors ?? []).find((v: any) => v.id === vendorId)?.name ?? "" }
          : null,
      })
    : [];

  const clearPendingEvidence = () => {
    setDescription((current) =>
      (current ?? "").replace(/\[PENDIENTE[^\]]*\]\s*/gi, "").trim(),
    );
  };

  const buildRuleDraft = (payload: any): ExpenseRuleDraft | null => {
    if (!isEdit || !expense?.company_id) return null;
    const labels: string[] = [];
    const changes: ExpenseRuleDraft["changes"] = {};

    if (payload.project_id && payload.project_id !== expense.project_id) {
      const p = (projects ?? []).find((x: any) => x.id === payload.project_id);
      changes.project_id = payload.project_id;
      changes.division_id = payload.division_id ?? p?.division_id ?? null;
      labels.push(`Proyecto → ${p?.name ?? "seleccionado"}`);
    }
    if (payload.category_id && payload.category_id !== expense.category_id) {
      const c = (categories ?? []).find((x: any) => x.id === payload.category_id);
      changes.category_id = payload.category_id;
      labels.push(`Categoría → ${c?.name ?? "seleccionada"}`);
    }
    if (payload.vendor_id && payload.vendor_id !== expense.vendor_id) {
      const v = (vendors ?? []).find((x: any) => x.id === payload.vendor_id);
      changes.vendor_id = payload.vendor_id;
      labels.push(`Vendor → ${v?.name ?? "seleccionado"}`);
    }
    if (payload.worker_id && payload.worker_id !== expense.worker_id) {
      changes.worker_id = payload.worker_id;
      labels.push("Ayudante → seleccionado");
    }
    if (payload.spent_on && payload.spent_on !== expense.spent_on && expense.spent_on > new Date().toISOString().slice(0, 10)) {
      changes.date_transform = "future_date_swap_dm";
      labels.push(`Fecha ${expense.spent_on} → ${payload.spent_on}`);
    }
    if (!labels.length) return null;
    return {
      companyId: expense.company_id,
      source: {
        description: expense.description,
        vendorName: expense.vendors?.name,
        categoryName: expense.categories?.name,
        projectName: expense.projects?.name,
        spentOn: expense.spent_on,
      },
      changes,
      labels,
      defaultField: changes.date_transform ? "spent_on" : undefined,
      defaultPattern: changes.date_transform ? "future_date_swap_dm" : undefined,
    };
  };

  const handleSave = async () => {
   try {
    let finalVendor = vendorId;
    if (newVendor.trim()) {
      const v = await createVendor.mutateAsync(newVendor.trim());
      finalVendor = v.id;
    }
    let finalCategory = categoryId;
    if (newCategory.trim()) {
      const c = await createCategory.mutateAsync({ name: newCategory.trim(), kind: "expense" });
      finalCategory = c.id;
    }

    // Use loose normalization so future-dated / odd receipts can still be saved;
    // FutureDateWarning already prompts the user inline before submit.
    const normalizedDate = normalizeReceiptDate(spentOn) ?? spentOn;
    if (!normalizedDate) {
      toast.error("La fecha del gasto no es válida. Revísala (formato YYYY-MM-DD).");
      return;
    }

    const parsed = schema.safeParse({
      unassigned,
      project_id: unassigned ? null : projectId,
      division_id: divisionId,
      vendor_id: finalVendor,
      category_id: finalCategory,
      worker_id: workerId,
      amount: Number(amount),
      spent_on: normalizedDate,
      description: description || null,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Completa el formulario");
      return;
    }
    const payload = {
      project_id: parsed.data.project_id,
      division_id: parsed.data.division_id,
      vendor_id: parsed.data.vendor_id,
      category_id: parsed.data.category_id,
      worker_id: parsed.data.worker_id,
      amount: parsed.data.amount,
      spent_on: parsed.data.spent_on,
      description: gasProrate && gasProrationNote
        ? [parsed.data.description, gasProrationNote].filter(Boolean).join(" · ")
        : (parsed.data.description ?? null),
      is_overhead: unassigned ? isOverhead : false,
    };

    let savedExpense: any | null = null;

    if (isEdit) {
      savedExpense = await updateExpense.mutateAsync({ id: expense.id, patch: payload });
      try {
        const resolvers = {
          project_id: (id: any) => (projects ?? []).find((p: any) => p.id === id)?.name,
          vendor_id: (id: any) => (vendors ?? []).find((v: any) => v.id === id)?.name,
          category_id: (id: any) => (categories ?? []).find((c: any) => c.id === id)?.name,
          division_id: (id: any) => (divisions ?? []).find((d: any) => d.id === id)?.name,
        };
        const changes = diffExpense(expense, payload, resolvers);
        if (changes.length && expense.company_id) {
          await logExpenseAudit({
            expenseId: expense.id,
            companyId: expense.company_id,
            source: "manual",
            changes,
          });
          qc.invalidateQueries({ queryKey: ["expense-audit", expense.id] });
        }
        for (const it of pendingItems) {
          await uploadReceipt.mutateAsync({
            file: it.file, expenseId: expense.id,
            divisionId: payload.division_id, projectId: payload.project_id,
          });
        }
      } catch (postErr) {
        console.warn("Post-save step failed (sheet will still close):", postErr);
      }
    } else {
      const extras = pendingItems.slice(1);
      // Always create the primary expense from the visible form
      const created = await createExpense.mutateAsync({ ...payload, bank_transaction_id: initialValues?.bank_transaction_id } as any);
      if (initialValues?.bank_transaction_id && created?.id) {
        await (supabase as any).from("bank_transactions").update({
          status: "matched",
          matched_expense_id: created.id,
          matched_payment_id: null,
          match_confidence: 1,
          reconciled_at: new Date().toISOString(),
        }).eq("id", initialValues.bank_transaction_id);
      }
      if (pendingItems[0] && created?.id) {
        await uploadReceipt.mutateAsync({
          file: pendingItems[0].file, expenseId: created.id,
          divisionId: payload.division_id, projectId: payload.project_id,
        });
      }
      // Persist project splits when this is an unassigned shared expense
      if (created?.id && unassigned && splits.length > 0) {
        const valid = splits.filter((r) => r.project_id && Number(r.amount) > 0);
        if (valid.length > 0) {
          const { data: prof2 } = await supabase
            .from("profiles").select("company_id")
            .eq("id", (await supabase.auth.getUser()).data.user!.id).maybeSingle();
          if (prof2?.company_id) {
            const rows = valid.map((r) => ({
              company_id: prof2.company_id,
              expense_id: created.id,
              project_id: r.project_id,
              amount: Number(r.amount),
            }));
            const { error: splitErr } = await supabase.from("expense_project_splits" as any).insert(rows);
            if (splitErr) console.warn("splits insert error", splitErr);
            else toast.success(`Gasto dividido entre ${valid.length} proyectos.`);
          }
        }
      }


      if (extras.length > 0) {
        if (consolidate) {
          // Attach all extra receipts to the same expense (amount already summed in form)
          for (const it of extras) {
            await uploadReceipt.mutateAsync({
              file: it.file, expenseId: created.id,
              divisionId: payload.division_id, projectId: payload.project_id,
            });
          }
        } else {
          // One expense per extra receipt, using its detected fields (with form fallbacks)
          for (const it of extras) {
            const det = it.detected ?? {};
            let extraVendor = payload.vendor_id;
            if (det.vendor) {
              const match = (vendors ?? []).find((v: any) => v.name.toLowerCase() === det.vendor!.toLowerCase());
              if (match) extraVendor = match.id;
              else {
                const v = await createVendor.mutateAsync(det.vendor);
                extraVendor = v.id;
              }
            }
            let extraCategory = payload.category_id;
            if (det.category) {
              const match = (categories ?? []).find((c: any) => c.name.toLowerCase() === det.category!.toLowerCase());
              if (match) extraCategory = match.id;
              else {
                const c = await createCategory.mutateAsync({ name: det.category, kind: "expense" });
                extraCategory = c.id;
              }
            }
            const extraDate = det.spent_on && plausibleReceiptDate(det.spent_on)
              ? det.spent_on
              : payload.spent_on;
            const extraAmount = det.amount && Number(det.amount) > 0 ? Number(det.amount) : null;
            if (!extraAmount) {
              toast.warning(`"${it.file.name}": no se detectó monto, se omitió. Súbelo manualmente.`);
              continue;
            }
            const extraPayload = {
              ...payload,
              vendor_id: extraVendor,
              category_id: extraCategory,
              amount: extraAmount,
              spent_on: extraDate,
              description: det.description ?? null,
            };
            const createdExtra = await createExpense.mutateAsync(extraPayload as any);
            if (createdExtra?.id) {
              await uploadReceipt.mutateAsync({
                file: it.file, expenseId: createdExtra.id,
                divisionId: extraPayload.division_id, projectId: extraPayload.project_id,
              });
            }
          }
          toast.success(`${1 + extras.length} gastos creados.`);
        }
      }
    }
    // Registrar patrón de vendor → categoría/proyecto/división para futuras sugerencias
    if (payload.vendor_id) {
      const { data: prof } = await supabase.from("profiles").select("company_id").eq("id", (await supabase.auth.getUser()).data.user!.id).maybeSingle();
      if (prof?.company_id) {
        recordPattern.mutate({
          company_id: prof.company_id,
          vendor_id: payload.vendor_id,
          category_id: payload.category_id,
          project_id: payload.project_id,
          division_id: payload.division_id,
        });
      }
    }
    // Saving never "resolves" an expense that is still missing information:
    // tell the user exactly what keeps it in the pending list.
    // Use the ACTUAL category/vendor names so isLaborExpense and hasIdentifiedPayee
    // detect labor/payee issues correctly — fake names hide real issues.
    const finalCategoryName = newCategory.trim()
      || (categories ?? []).find((c: any) => c.id === finalCategory)?.name
      || "";
    const finalVendorName = newVendor.trim()
      || (vendors ?? []).find((v: any) => v.id === finalVendor)?.name
      || "";
    if (isEdit && savedExpense) {
      const draft = buildRuleDraft(payload);
      const disposition = getExpenseReviewSaveAction(savedExpense, !!draft);
      setServerReviewIssues(disposition.issues);
      onReviewVerified?.({ id: savedExpense.id, issues: disposition.issues });

      if (disposition.action === "stay_open") {
        setRuleDraft(null);
        toast.warning(
          `Guardado. Todavía falta corregir: ${disposition.issues.map(formatIssueKind).join(" · ").toLowerCase()}`,
        );
        return;
      }

      if (disposition.action === "prompt_learning" && draft) {
        setRuleDraft(draft);
        toast.success("Gasto corregido. Ya no está por revisar.");
        return;
      }

      toast.success("Gasto corregido. Ya no está por revisar.");
      onOpenChange(false);
      return;
    }

    const remaining = getExpenseIssueKinds({
      ...payload,
      categories: finalCategory ? { name: finalCategoryName } : null,
      vendors: finalVendor ? { name: finalVendorName } : null,
    });
    if (remaining.length > 0) {
      toast.warning(`Guardado, pero sigue pendiente: falta ${remaining.map(formatIssueKind).join(" · ").toLowerCase()}`);
    }
    onOpenChange(false);
   } catch (err: any) {
     console.error("Error saving expense:", err);
     toast.error(err?.message ?? "No se pudo guardar el gasto. Intenta de nuevo.");
   }
  };

  return (
    <>
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        <SheetHeader><SheetTitle>{isEdit ? "Editar gasto" : "Agregar gasto"}</SheetTitle></SheetHeader>
        <div className="mt-4 space-y-4">
          {initialValues?.voice_review && !isEdit && (
            <div className="space-y-3 rounded-lg border border-primary/40 bg-primary/5 p-3">
              <div>
                <p className="text-xs font-semibold uppercase text-muted-foreground">Transcripción</p>
                <p className="mt-1 text-sm">“{initialValues.voice_review.transcript}”</p>
              </div>
              {(initialValues.voice_review.warnings.length > 0 || initialValues.voice_review.needs_review.length > 0) && (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs">
                  <p className="font-semibold text-amber-700 dark:text-amber-400">Revisa los campos marcados antes de confirmar</p>
                  {initialValues.voice_review.warnings.map((warning) => <p key={warning} className="mt-1">{warning}</p>)}
                  <p className="mt-1 text-muted-foreground">Pendientes: {initialValues.voice_review.needs_review.join(", ")}</p>
                </div>
              )}
              <p className="text-xs text-muted-foreground">Nada se guardará hasta que pulses Confirmar gasto.</p>
            </div>
          )}
          {isEdit && expense?.id && (
            <div className="rounded-lg border bg-muted/30 p-3">
              <ExpenseTraceability expenseId={expense.id} />
            </div>
          )}
          {isEdit && Array.from(new Set([...liveReviewIssues, ...serverReviewIssues])).length > 0 && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
              <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                Falta corregir: {Array.from(new Set([...liveReviewIssues, ...serverReviewIssues])).map(formatIssueKind).join(" · ")}
              </p>
              {Array.from(new Set([...liveReviewIssues, ...serverReviewIssues])).includes("pending_evidence") && (
                <Button type="button" size="sm" variant="outline" className="mt-2" onClick={clearPendingEvidence}>
                  Marcar evidencia como revisada
                </Button>
              )}
              {serverReviewIssues.length > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  El servidor confirmó que este gasto sigue en revisión. Corrige lo indicado y vuelve a guardar.
                </p>
              )}
            </div>
          )}
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Sin asignar</p>
              <p className="text-xs text-muted-foreground">Sin proyecto (gastos generales, etc.)</p>
            </div>
            <Switch checked={unassigned} onCheckedChange={(v) => { setUnassigned(v); if (v) { setProjectId(null); } else { setIsOverhead(false); } }} />
          </div>

          {unassigned && (
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">Gasto general (prorratear)</p>
                <p className="text-xs text-muted-foreground">
                  Distribuir entre proyectos activos del mes, proporcional a su gasto directo. Excluye sandbox y proyectos marcados como opt-out.
                </p>
              </div>
              <Switch checked={isOverhead} onCheckedChange={setIsOverhead} />
            </div>
          )}

          <div>
            <Label>{unassigned ? "Proyecto (opcional, asigna para quitar Sin asignar)" : "Proyecto *"}</Label>
            <SearchableSelect
              options={(projects ?? []).map((p: any) => ({ value: p.id, label: p.name, hint: p.project_code }))}
              value={projectId ?? ""}
              onChange={(v) => { setProjectId(v); if (v) { setUnassigned(false); setIsOverhead(false); } }}
              placeholder="Selecciona un proyecto"
              searchPlaceholder="Buscar proyecto…"
              emptyText="Sin proyectos que coincidan"
            />
            {unassigned && projectId && (
              <p className="mt-1 text-xs text-primary">Al elegir un proyecto, se quita la marca "Sin asignar".</p>
            )}
          </div>

          <div>
            <Label>División *</Label>
            <Select value={divisionId} onValueChange={setDivisionId} disabled={!unassigned && !!projectId}>
              <SelectTrigger className="h-11"><SelectValue placeholder="Selecciona una división" /></SelectTrigger>
              <SelectContent>
                {(divisions ?? []).map((d: any) => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!unassigned && projectId && <p className="mt-1 text-xs text-muted-foreground">Heredado del proyecto</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Monto *</Label>
              <Input type="number" inputMode="decimal" min="0" step="0.01" className="h-11" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <Label>Fecha *</Label>
              <Input type="date" className="h-11" value={spentOn} onChange={(e) => setSpentOn(e.target.value)} />
              <FutureDateWarning value={spentOn} onFix={(d) => setSpentOn(d)} />
            </div>
          </div>

          <div>
            <Label>Categoría *</Label>
            <SearchableSelect
              options={(categories ?? []).map((c: any) => ({ value: c.id, label: c.name }))}
              value={categoryId}
              onChange={(v) => { setCategoryId(v); setNewCategory(""); }}
              placeholder="Selecciona una categoría"
              searchPlaceholder="Buscar categoría…"
              emptyText="Sin categorías que coincidan"
            />
            <Input className="mt-2 h-10" placeholder="O agregar nueva categoría…" value={newCategory} onChange={(e) => { setNewCategory(e.target.value); if (e.target.value) setCategoryId(""); }} maxLength={60} />
          </div>

          {isGasExpense && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Prorratear entre trabajos activos</p>
                  <p className="text-[11px] text-muted-foreground">
                    Distribuye el monto proporcional al valor de contrato de cada trabajo activo.
                  </p>
                </div>
                <Switch
                  checked={gasProrate}
                  onCheckedChange={(v) => {
                    setGasProrate(v);
                    if (v && !unassigned) setUnassigned(true);
                    if (!v) { setSplits([]); setGasProrationNote(null); setGasProrationError(null); }
                  }}
                />
              </div>
              {gasProrate && gasProrationError && (
                <p className="text-[11px] text-amber-600">{gasProrationError}</p>
              )}
              {gasProrate && gasProrationNote && !gasProrationError && (
                <p className="text-[11px] text-primary">{gasProrationNote}</p>
              )}
              {gasProrate && splits.length > 0 && !gasProrationError && (
                <div className="space-y-1">
                  {splits.map((row) => {
                    const p = (projects ?? []).find((x: any) => x.id === row.project_id);
                    return (
                      <div key={row.id} className="flex items-center justify-between text-xs">
                        <span className="truncate">{p?.name ?? "Proyecto"}</span>
                        <span className="font-medium">${Number(row.amount).toFixed(2)}</span>
                      </div>
                    );
                  })}
                  <div className="flex items-center justify-between text-xs border-t pt-1">
                    <span className="text-muted-foreground">Total asignado</span>
                    <span className="font-bold">${splitTotal.toFixed(2)}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          <div>
            <Label>Realizado por (ayudante / subcontratista)</Label>
            <WorkerPicker
              value={workerId}
              onChange={setWorkerId}
              divisionId={divisionId || null}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Útil para labor: quién hizo el trabajo. El "tipo de labor" va en la descripción.
            </p>
          </div>

          <div>
            <Label>Proveedor</Label>
            <SearchableSelect
              options={(vendors ?? []).map((v: any) => ({ value: v.id, label: v.name }))}
              value={vendorId ?? ""}
              onChange={(v) => { setVendorId(v); setNewVendor(""); }}
              placeholder="Selecciona un proveedor (opcional)"
              searchPlaceholder="Buscar proveedor…"
              emptyText="Sin proveedores que coincidan"
            />
            <Input className="mt-2 h-10" placeholder="O agregar nuevo proveedor…" value={newVendor} onChange={(e) => { setNewVendor(e.target.value); if (e.target.value) setVendorId(null); }} maxLength={80} />
          </div>

          <div>
            <Label>Descripción</Label>
            <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} placeholder="Notas opcionales. Si es un gasto general (gas, internet, comida, agua), agrega aquí la subcategoría." />
          </div>

          {initialValues?.voice_review && !isEdit && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Subcategoría sugerida</Label>
                <Input className="h-11" value={voiceSubcategory} onChange={(event) => setVoiceSubcategory(event.target.value)} placeholder="Sin sugerencia" />
                <p className="mt-1 text-[11px] text-muted-foreground">Referencia de revisión; no existe un campo separado en el gasto.</p>
              </div>
              <div>
                <Label>Método de pago sugerido</Label>
                <Input className="h-11" value={voicePaymentMethod} onChange={(event) => setVoicePaymentMethod(event.target.value)} placeholder="Sin sugerencia" />
                <p className="mt-1 text-[11px] text-muted-foreground">Referencia de revisión; no existe un campo separado en el gasto.</p>
              </div>
            </div>
          )}

          {/* Split between multiple projects (e.g. General Expenses shared by several jobs) */}
          {unassigned && (
            <div className="rounded-lg border p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Dividir entre proyectos (opcional)</p>
                  <p className="text-[11px] text-muted-foreground">
                    Útil para General Expenses (Publix, gas, internet…) que pertenecen a varios proyectos.
                  </p>
                </div>
                <Button type="button" size="sm" variant="outline" className="h-8" onClick={addSplit}>
                  + Proyecto
                </Button>
              </div>
              {splits.length > 0 && (
                <>
                  {splits.map((row) => (
                    <div key={row.id} className="flex items-center gap-2">
                      <SearchableSelect
                        className="flex-1"
                        triggerClassName="h-10"
                        options={(projects ?? []).map((p: any) => ({ value: p.id, label: p.name }))}
                        value={row.project_id}
                        onChange={(v) => updateSplit(row.id, { project_id: v })}
                        placeholder="Proyecto…"
                        searchPlaceholder="Buscar proyecto…"
                      />
                      <Input
                        type="number" inputMode="decimal" min="0" step="0.01"
                        className="h-10 w-24" placeholder="0.00"
                        value={row.amount}
                        onChange={(e) => updateSplit(row.id, { amount: e.target.value })}
                      />
                      <Button type="button" variant="ghost" size="sm" className="h-8 px-2" onClick={() => removeSplit(row.id)}>×</Button>
                    </div>
                  ))}
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      Suma asignada: <b>${splitTotal.toFixed(2)}</b> de ${(Number(amount) || 0).toFixed(2)}
                    </span>
                    <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={splitAuto}>
                      Dividir en partes iguales
                    </Button>
                  </div>
                  {Math.abs(splitTotal - (Number(amount) || 0)) > 0.01 && splitTotal > 0 && (
                    <p className="text-[11px] text-amber-600">
                      ⚠ La suma de los splits no coincide con el monto total.
                    </p>
                  )}
                </>
              )}
            </div>
          )}


          <div className="flex items-start justify-between rounded-lg border p-3 gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <Sparkles className="h-3.5 w-3.5 text-primary" /> Revisión IA
              </p>
              <p className="text-[11px] text-muted-foreground">
                {reviewMode
                  ? "Pediré confirmación antes de aplicar cualquier valor detectado por la IA."
                  : "La IA autocompletará automáticamente los campos vacíos."}
              </p>
            </div>
            <Switch checked={reviewMode} onCheckedChange={setReviewMode} />
          </div>

          {reviewMode && proposals.length > 0 && (
            <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="flex items-center gap-1.5 text-xs font-medium text-primary">
                  <Sparkles className="h-3 w-3" /> Cambios sugeridos por la IA ({proposals.length})
                </p>
                <div className="flex gap-1">
                  <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={rejectAllProposals}>
                    Rechazar todos
                  </Button>
                  <Button type="button" size="sm" className="h-7 text-xs" onClick={acceptAllProposals}>
                    Aceptar todos
                  </Button>
                </div>
              </div>
              <ul className="space-y-2">
                {proposals.map((p) => (
                  <li key={p.field} className="rounded-md border bg-background p-2">
                    <p className="text-xs font-medium">{p.label}</p>
                    <div className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-xs">
                      <span className="text-muted-foreground">Actual:</span>
                      <span className="break-words">{p.currentDisplay}</span>
                      <span className="text-muted-foreground">Propuesto:</span>
                      <span className="font-medium text-primary break-words">{p.proposedDisplay}</span>
                    </div>
                    <div className="mt-2 flex justify-end gap-1">
                      <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => rejectProposal(p.field)}>
                        Mantener
                      </Button>
                      <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => acceptProposal(p.field)}>
                        Aplicar
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <Label>{isEdit ? "Recibo" : `Recibos (${pendingItems.length}/${MAX_RECEIPTS})`}</Label>
            {isEdit ? (
              <ReceiptUploader
                expenseId={expense.id}
                divisionId={divisionId || null}
                receipt={currentReceipt as any}
                onParsed={applyParsed}
              />
            ) : (
              <div className="space-y-2">
                {pendingItems.map((it, idx) => (
                  <div key={it.id} className="rounded-lg border p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm">
                          {idx === 0 && pendingItems.length > 1 && (
                            <span className="mr-1 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">PRINCIPAL</span>
                          )}
                          {it.file.name}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {(it.file.size / 1024).toFixed(0)} KB
                          {it.status === "extracting" && ` · analizando${it.attempt > 1 ? ` (${it.attempt}/3)` : ""}…`}
                          {it.status === "done" && it.detected?.amount != null && ` · $${it.detected.amount}`}
                          {it.status === "done" && it.detected?.vendor && ` · ${it.detected.vendor}`}
                          {it.status === "failed" && " · no se pudo leer"}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {it.status === "failed" && (
                          <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => extractFromItem(it.id, { applyToForm: idx === 0 })}>
                            Reintentar
                          </Button>
                        )}
                        <Button type="button" variant="ghost" size="sm" onClick={() => removePendingItem(it.id)} disabled={it.status === "extracting"}>
                          Quitar
                        </Button>
                      </div>
                    </div>
                    {idx === 0 && it.status === "extracting" && (
                      <p className="flex items-center gap-1.5 text-xs text-primary">
                        <Sparkles className="h-3 w-3 animate-pulse" /> Analizando recibo con IA…
                      </p>
                    )}
                  </div>
                ))}

                {pendingItems.length >= 2 && (
                  <div className="flex items-start justify-between rounded-lg border border-primary/30 bg-primary/5 p-3 gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">Consolidar en un solo gasto</p>
                      <p className="text-[11px] text-muted-foreground">
                        {consolidate
                          ? "Se sumarán los montos detectados; proveedor/fecha quedarán vacíos si difieren entre recibos."
                          : `Se crearán ${pendingItems.length} gastos separados (uno por recibo).`}
                      </p>
                    </div>
                    <Switch
                      checked={consolidate}
                      onCheckedChange={(v) => {
                        setConsolidate(v);
                        if (v) {
                          // Sum amounts; clear vendor/date if any disagreement among detected items
                          const dets = pendingItems.map((p) => p.detected).filter(Boolean) as DetectedFields[];
                          const total = dets.reduce((s, d) => s + (d.amount ? Number(d.amount) : 0), 0);
                          if (total > 0) setAmount(String(total));
                          const vendorSet = new Set(dets.map((d) => (d.vendor ?? "").toLowerCase().trim()).filter(Boolean));
                          if (vendorSet.size > 1) { setVendorId(null); setNewVendor(""); }
                          const dates = new Set(dets.map((d) => d.spent_on ?? "").filter(Boolean));
                          if (dates.size > 1) setSpentOn("");
                        } else {
                          // Restore primary's amount when un-consolidating
                          const first = pendingItems[0]?.detected;
                          if (first?.amount) setAmount(String(first.amount));
                        }
                      }}
                    />
                  </div>
                )}

                {pendingItems.length < MAX_RECEIPTS && (
                  <div>
                    <input
                      id="expense-pending-receipt"
                      type="file"
                      accept="image/jpeg,image/png,image/heic,image/heif,application/pdf"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        const files = Array.from(e.target.files ?? []);
                        addPendingFiles(files);
                        e.target.value = "";
                      }}
                    />
                    <Button type="button" variant="outline" className="h-11 w-full" onClick={() => document.getElementById("expense-pending-receipt")?.click()}>
                      <Sparkles className="mr-2 h-4 w-4" />
                      {pendingItems.length === 0 ? "Subir foto o PDF del recibo" : "Agregar otro recibo"}
                    </Button>
                    <p className="mt-1 text-xs text-muted-foreground">
                      La IA leerá cada recibo y autocompletará el formulario · JPG, PNG, PDF · max 10 MB · hasta {MAX_RECEIPTS}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1 h-11" onClick={() => onOpenChange(false)} disabled={submitting}>Cancelar</Button>
            <Button className="flex-1 h-11" onClick={handleSave} disabled={submitting}>{submitting ? "Guardando…" : initialValues?.voice_review ? "Confirmar gasto" : "Guardar"}</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
    <SaveExpenseRuleDialog
      draft={ruleDraft}
      onClose={() => {
        setRuleDraft(null);
        onOpenChange(false);
      }}
      onSaved={() => qc.invalidateQueries({ queryKey: ["expenses"] })}
    />
    </>
  );
}
