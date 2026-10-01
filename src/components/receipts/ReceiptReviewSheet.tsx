import { useEffect, useMemo, useRef, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertTriangle, Download, FileText, Image as ImageIcon, Link2, Loader2,
  Sparkles, Trash2, UploadCloud, XCircle,
} from "lucide-react";
import {
  createReceiptObjectUrl,
  useCategories,
  useConvertReceiptToExpense,
  useCreateCategory,
  useCreateVendor,
  useDeleteReceipt,
  useDivisions,
  useDuplicateExpenseCheck,
  useExpenses,
  useLinkReceipt,
  useProjects,
  useReplaceReceiptFile,
  useSetReceiptStatus,
  useUpdateReceipt,
  useVendors,
  useWorkers,
  RECEIPT_ALLOWED_MIME,
  RECEIPT_MAX_BYTES,
  getReceiptMimeType,
} from "@/hooks/useTrifectaData";
import { ReceiptStatusBadge } from "@/components/receipts/ReceiptStatusBadge";
import { PdfReceiptViewer } from "@/components/receipts/PdfReceiptViewer";
import { PAYMENT_METHODS } from "@/lib/enums";
import { usd } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import { extractReceiptText } from "@/lib/receiptText";
import { toast } from "sonner";
import { parseReceiptOcrResponse, withReceiptOcrTimeout } from "@/lib/receiptOcr";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  receipt: any | null;
}

function ReceiptInlinePreview({ filePath, storagePath, mimeType, fileName }: { filePath?: string | null; storagePath?: string | null; mimeType?: string | null; fileName?: string | null }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("No se pudo mostrar la vista previa. Descarga el archivo.");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setLoading(true); setError(false); setUrl(null);
    setErrorMessage("No se pudo mostrar la vista previa. Descarga el archivo.");
    createReceiptObjectUrl({ storagePath, fileUrl: filePath, mimeType })
      .then(({ url: u }) => {
        objectUrl = u;
        if (cancelled) {
          URL.revokeObjectURL(u);
          return;
        }
        setUrl(u);
      })
      .catch((err) => {
        if (!cancelled) {
          setErrorMessage(err?.message || "No se pudo mostrar la vista previa. Descarga el archivo.");
          setError(true);
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [filePath, storagePath, mimeType]);

  const isImage = mimeType?.startsWith("image/");
  const isPdf = mimeType === "application/pdf";

  return (
    <div className="overflow-hidden rounded-lg border bg-muted">
      <div className="h-56 w-full">
        {loading && (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cargando vista previa…
          </div>
        )}
        {!loading && (error || !url) && (
          <div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
            {errorMessage}
          </div>
        )}
        {!loading && url && !error && isImage && (
          <div className="flex h-full items-center justify-center bg-background">
            <img src={url} alt={fileName ?? "Recibo"} className="max-h-full max-w-full object-contain" onError={() => setError(true)} />
          </div>
        )}
        {!loading && url && !error && isPdf && (
          <PdfReceiptViewer url={url} fileName={fileName} className="h-full w-full" />
        )}
      </div>
      {url && (
        <div className="flex items-center justify-end gap-2 border-t bg-background p-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              try {
                const a = document.createElement("a");
                a.href = url;
                a.download = fileName || "receipt";
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
              } catch {
                toast.error("No se pudo descargar el archivo.");
              }
            }}
          >
            <Download className="mr-1 h-4 w-4" /> Descargar
          </Button>
        </div>
      )}
    </div>
  );
}

export function ReceiptReviewSheet({ open, onOpenChange, receipt }: Props) {
  const { data: projects } = useProjects();
  const { data: divisions } = useDivisions();
  const { data: vendors } = useVendors();
  const { data: categories } = useCategories("expense");
  const { data: workers } = useWorkers({ activeOnly: true });
  const createVendor = useCreateVendor();
  const createCategory = useCreateCategory();

  const update = useUpdateReceipt();
  const setStatus = useSetReceiptStatus();
  const convert = useConvertReceiptToExpense();
  const link = useLinkReceipt();
  const replaceFile = useReplaceReceiptFile();
  const del = useDeleteReceipt();

  const [unassigned, setUnassigned] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [divisionId, setDivisionId] = useState<string>("");
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [spentOn, setSpentOn] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [workerId, setWorkerId] = useState<string | null>(null);
  const [notes, setNotes] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<string>("");
  const [newVendor, setNewVendor] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [extractingReceipt, setExtractingReceipt] = useState(false);
  const [subtotal, setSubtotal] = useState<string>("");
  const [tax, setTax] = useState<string>("");
  const [last4, setLast4] = useState<string>("");
  const [lineItems, setLineItems] = useState<Array<{ description: string; quantity: number | null; unit_price: number | null; total: number | null }>>([]);

  const [linkOpen, setLinkOpen] = useState(false);
  const [pickedExpenseId, setPickedExpenseId] = useState<string>("");
  const [expenseQuery, setExpenseQuery] = useState("");

  const replaceInputRef = useRef<HTMLInputElement>(null);

  // Reset form when receipt changes
  useEffect(() => {
    if (!open || !receipt) return;
    setUnassigned(!receipt.project_id);
    setProjectId(receipt.project_id ?? null);
    setDivisionId(receipt.division_id ?? "");
    setVendorId(receipt.vendor_id ?? null);
    setCategoryId(receipt.category_id ?? "");
    setAmount(receipt.amount != null ? String(receipt.amount) : "");
    setSpentOn(receipt.spent_on ?? "");
    setDescription(receipt.description ?? "");
    setNotes(receipt.notes ?? "");
    setPaymentMethod(receipt.payment_method ?? "");
    setNewVendor(""); setNewCategory("");
    setPickedExpenseId(receipt.expense_id ?? "");
    const ext = (receipt as any).extracted ?? {};
    setWorkerId(typeof ext.worker_id === "string" ? ext.worker_id : null);
    setSubtotal(ext.subtotal != null ? String(ext.subtotal) : "");
    setTax(ext.tax != null ? String(ext.tax) : "");
    setLast4(typeof ext.last4 === "string" ? ext.last4 : "");
    setLineItems(Array.isArray((receipt as any).line_items) ? (receipt as any).line_items : []);
  }, [open, receipt]);

  // Inherit division from project
  useEffect(() => {
    if (unassigned || !projectId || !projects) return;
    const p = projects.find((x: any) => x.id === projectId);
    if (p?.division_id) setDivisionId(p.division_id);
  }, [projectId, projects, unassigned]);

  const norm = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

  const blobToDataUrl = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });

  const numericAmount = useMemo(() => {
    const n = Number(amount);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [amount]);

  const dup = useDuplicateExpenseCheck({
    projectId: unassigned ? null : projectId,
    vendorId,
    amount: numericAmount,
    spentOn: spentOn || null,
    excludeExpenseId: receipt?.expense_id ?? null,
  });

  const { data: allExpenses } = useExpenses();
  const filteredExpenses = useMemo(() => {
    let rows: any[] = allExpenses ?? [];
    if (!unassigned && projectId) rows = rows.filter((e) => e.project_id === projectId);
    const q = expenseQuery.trim().toLowerCase();
    if (q) {
      rows = rows.filter((e) =>
        [e.vendors?.name, e.categories?.name, e.description, e.projects?.name, String(e.amount)]
          .filter(Boolean).some((s: string) => s.toLowerCase().includes(q))
      );
    }
    return rows.slice(0, 100);
  }, [allExpenses, unassigned, projectId, expenseQuery]);

  const numericSubtotal = useMemo(() => { const n = Number(subtotal); return Number.isFinite(n) && n > 0 ? n : null; }, [subtotal]);
  const numericTax = useMemo(() => { const n = Number(tax); return Number.isFinite(n) && n >= 0 ? n : null; }, [tax]);
  const selectedCategory = (categories ?? []).find((category: any) => category.id === categoryId);
  const isLaborCategory = /labor|mano de obra/i.test(`${selectedCategory?.name ?? ""} ${newCategory}`);
  const fieldsNeedingReview = [
    !numericAmount ? "monto" : null,
    !spentOn ? "fecha" : null,
    !categoryId && !newCategory.trim() ? "categoría" : null,
    !divisionId ? "división" : null,
    !unassigned && !projectId ? "proyecto" : null,
  ].filter(Boolean) as string[];

  if (!receipt) return null;

  const isImage = receipt.mime_type?.startsWith("image/");
  const isConverted = receipt.status === "converted_to_expense";
  const isRejected = receipt.status === "rejected";

  // Resolve vendor/category creation, then return ids
  const resolveVendorAndCategory = async () => {
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
    return { finalVendor, finalCategory };
  };

  const buildPatch = (extra: Record<string, any> = {}) => {
    const existingExtracted = ((receipt as any)?.extracted && typeof (receipt as any).extracted === "object") ? (receipt as any).extracted : {};
    const last4Clean = (last4 || "").replace(/\D/g, "").slice(-4);
    return {
      project_id: unassigned ? null : projectId,
      division_id: divisionId || null,
      vendor_id: vendorId,
      category_id: categoryId || null,
      amount: numericAmount,
      spent_on: spentOn || null,
      payment_method: paymentMethod || null,
      description: description || null,
      notes: notes || null,
      line_items: lineItems,
      extracted: {
        ...existingExtracted,
        subtotal: numericSubtotal,
        tax: numericTax,
        last4: last4Clean || null,
        worker_id: isLaborCategory ? workerId : null,
      },
      ...extra,
    };
  };

  // ---- Actions ----
  const handleSaveDraft = async () => {
    const { finalVendor, finalCategory } = await resolveVendorAndCategory();
    setVendorId(finalVendor); setCategoryId(finalCategory);

    const newStatus =
      finalCategory && numericAmount && spentOn && divisionId
        ? "ready_to_convert"
        : !unassigned && projectId
        ? "linked_to_project"
        : "needs_review";

    await update.mutateAsync({
      id: receipt.id,
      patch: { ...buildPatch({ vendor_id: finalVendor, category_id: finalCategory }), status: newStatus },
    });
    toast.success("Borrador guardado");
  };

  const handleKeepUnassigned = async () => {
    await update.mutateAsync({
      id: receipt.id,
      patch: { ...buildPatch({ project_id: null }), status: "needs_review" },
    });
    setUnassigned(true);
    setProjectId(null);
    toast.success("Recibo guardado como pendiente");
  };

  const handleReject = async () => {
    await setStatus.mutateAsync({ id: receipt.id, status: "rejected" });
    onOpenChange(false);
  };

  const handleDelete = async () => {
    await del.mutateAsync({ id: receipt.id, path: receipt.storage_path ?? receipt.file_url });
    onOpenChange(false);
  };

  const resolveDivisionId = (): string => {
    if (divisionId) return divisionId;
    if (!unassigned && projectId) {
      const p = (projects ?? []).find((x: any) => x.id === projectId);
      if (p?.division_id) return p.division_id;
    }
    // Fallback: first available division (single-company tenants usually only have one)
    const first = (divisions ?? [])[0];
    return first?.id ?? "";
  };

  const validateForExpense = (resolvedDivision: string) => {
    if (!resolvedDivision) { toast.error("Selecciona una división"); return false; }
    if (!unassigned && !projectId) { toast.error("Selecciona un proyecto o guarda el recibo pendiente"); return false; }
    if (!categoryId && !newCategory.trim()) { toast.error("Selecciona una categoría"); return false; }
    if (!numericAmount) { toast.error("El monto debe ser mayor que cero"); return false; }
    if (!spentOn) { toast.error("Selecciona la fecha del recibo"); return false; }
    return true;
  };

  const handleCreateExpense = async () => {
    const divId = resolveDivisionId();
    if (!validateForExpense(divId)) return;
    if (divId !== divisionId) setDivisionId(divId);
    const { finalVendor, finalCategory } = await resolveVendorAndCategory();
    await convert.mutateAsync({
      receiptId: receipt.id,
      payload: {
        project_id: unassigned ? null : projectId,
        division_id: divId,
        vendor_id: finalVendor,
        category_id: finalCategory,
        amount: numericAmount!,
        spent_on: spentOn,
        description: description || null,
        worker_id: isLaborCategory ? workerId : null,
      },
    });
    onOpenChange(false);
  };

  const handleLinkExisting = async () => {
    if (!pickedExpenseId) { toast.error("Selecciona un gasto para asociar"); return; }
    await link.mutateAsync({ id: receipt.id, expenseId: pickedExpenseId });
    setLinkOpen(false);
    onOpenChange(false);
  };

  const handleReplaceFile = async (rawFile?: File) => {
    if (!rawFile) return;
    if (!RECEIPT_ALLOWED_MIME.includes(getReceiptMimeType(rawFile))) { toast.error("Solo JPG, PNG, HEIC o PDF"); return; }
    if (rawFile.size > RECEIPT_MAX_BYTES) { toast.error("El archivo excede 10 MB"); return; }
    const { prepareReceiptFile, isHeicLike } = await import("@/lib/imagePrep");
    const file = await prepareReceiptFile(rawFile);
    if (isHeicLike(rawFile) && !isHeicLike(file)) toast.message("HEIC convertido a JPG");
    await replaceFile.mutateAsync({ receiptId: receipt.id, file });
    if (replaceInputRef.current) replaceInputRef.current.value = "";
  };

  const handleReadWithAI = async () => {
    setExtractingReceipt(true);
    try {
      const { blob } = await createReceiptObjectUrl({
        storagePath: receipt.storage_path,
        fileUrl: receipt.file_url,
        mimeType: receipt.mime_type,
      });
      const file = new File([blob], receipt.file_name ?? "receipt", { type: receipt.mime_type ?? blob.type });
      const dataUrl = await blobToDataUrl(blob);
      const ocrText = await extractReceiptText(file).catch(() => "");
      const { data, error } = await withReceiptOcrTimeout(supabase.functions.invoke("process-receipt", {
        body: {
          fileDataUrl: dataUrl,
          ocrText,
          knownCategories: (categories ?? []).map((c: any) => c.name),
          knownVendors: (vendors ?? []).map((v: any) => v.name),
        },
      }));
      if (error) throw error;
      const parsed = parseReceiptOcrResponse(data);

      const matchedVendor = parsed?.vendor
        ? (vendors ?? []).find((v: any) => norm(v.name) === norm(parsed.vendor))
        : null;
      const matchedCategory = parsed?.category
        ? (categories ?? []).find((c: any) => norm(c.name) === norm(parsed.category))
        : null;

      if (parsed?.amount != null) setAmount(String(parsed.amount));
      if (parsed?.spent_on) setSpentOn(parsed.spent_on);
      if (parsed?.description) setDescription(parsed.description);
      if (parsed?.subtotal != null) setSubtotal(String(parsed.subtotal));
      if (parsed?.tax != null) setTax(String(parsed.tax));
      if (parsed?.last4) setLast4(String(parsed.last4));
      if (parsed?.payment_method) setPaymentMethod(parsed.payment_method);
      if (Array.isArray(parsed?.line_items) && parsed.line_items.length > 0) setLineItems(parsed.line_items);
      if (matchedVendor?.id) { setVendorId(matchedVendor.id); setNewVendor(""); }
      else if (parsed?.vendor) { setNewVendor(parsed.vendor); setVendorId(null); }
      if (matchedCategory?.id) { setCategoryId(matchedCategory.id); setNewCategory(""); }
      else if (parsed?.category) { setNewCategory(parsed.category); setCategoryId(""); }

      const extras: string[] = [];
      if (parsed?.line_items?.length) extras.push(`${parsed.line_items.length} partidas`);
      if (parsed?.last4) extras.push(`tarjeta •••• ${parsed.last4}`);
      const detail = extras.length ? ` · ${extras.join(" · ")}` : "";
      toast.success(parsed?.amount ? `Monto detectado: $${parsed.amount}${detail}` : "No se detectó monto; revisa manualmente");
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo leer el recibo");
    } finally {
      setExtractingReceipt(false);
    }
  };

  const submitting =
    update.isPending || setStatus.isPending || convert.isPending ||
    link.isPending || replaceFile.isPending || del.isPending || extractingReceipt;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[95dvh] overflow-y-auto overscroll-contain rounded-t-2xl pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <SheetHeader className="text-left">
          <SheetTitle className="flex items-center gap-2">
            {isImage ? <ImageIcon className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
            <span className="truncate">{receipt.file_name ?? "Receipt"}</span>
          </SheetTitle>
        </SheetHeader>

        <input
          ref={replaceInputRef}
          type="file"
          accept="image/jpeg,image/png,image/heic,image/heif,application/pdf"
          className="hidden"
          onChange={(e) => handleReplaceFile(e.target.files?.[0])}
        />

        <div className="mt-4 space-y-4">
          <ReceiptInlinePreview filePath={receipt.file_url} storagePath={receipt.storage_path} mimeType={receipt.mime_type} fileName={receipt.file_name} />

          <Card>
            <CardContent className="space-y-1 p-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Estado</span>
                <ReceiptStatusBadge status={receipt.status} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Subido</span>
                <span>{new Date(receipt.created_at).toLocaleString()}</span>
              </div>
              {receipt.expenses && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Gasto asociado</span>
                  <span className="truncate text-right">
                    {usd(Number(receipt.expenses.amount ?? 0))} · {receipt.expenses.spent_on}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          {!isConverted && (
            <Button variant="outline" className="h-11 w-full" onClick={handleReadWithAI} disabled={submitting}>
              {extractingReceipt ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              {extractingReceipt ? "Leyendo recibo…" : "Leer monto con IA"}
            </Button>
          )}

          {!isConverted && fieldsNeedingReview.length > 0 && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Datos que necesitan revisión</AlertTitle>
              <AlertDescription>
                Completa o confirma: {fieldsNeedingReview.join(", ")}. Ningún dato faltante se rellenará automáticamente.
              </AlertDescription>
            </Alert>
          )}

          {/* Editable fields */}
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Sin proyecto</p>
              <p className="text-xs text-muted-foreground">Guardar pendiente para resolver después</p>
            </div>
            <Switch
              checked={unassigned}
              onCheckedChange={(v) => { setUnassigned(v); if (v) setProjectId(null); }}
              disabled={isConverted}
            />
          </div>

          {!unassigned && (
            <div>
              <Label>Proyecto</Label>
              <Select value={projectId ?? ""} onValueChange={setProjectId} disabled={isConverted}>
                <SelectTrigger className="h-11"><SelectValue placeholder="Selecciona un proyecto" /></SelectTrigger>
                <SelectContent>
                  {(projects ?? []).map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label>División *</Label>
            <Select value={divisionId} onValueChange={setDivisionId} disabled={isConverted || (!unassigned && !!projectId)}>
              <SelectTrigger className="h-11"><SelectValue placeholder="Selecciona una división" /></SelectTrigger>
              <SelectContent>
                {(divisions ?? []).map((d: any) => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!unassigned && projectId && <p className="mt-1 text-xs text-muted-foreground">Se toma del proyecto</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Monto *</Label>
              <Input type="number" inputMode="decimal" min="0" step="0.01" className="h-11"
                value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" disabled={isConverted} />
            </div>
            <div>
              <Label>Fecha *</Label>
              <Input type="date" className="h-11" value={spentOn} onChange={(e) => setSpentOn(e.target.value)} disabled={isConverted} />
            </div>
          </div>

          <div>
            <Label>Categoría *</Label>
            <Select value={categoryId} onValueChange={(v) => { setCategoryId(v); setNewCategory(""); }} disabled={isConverted}>
              <SelectTrigger className="h-11"><SelectValue placeholder="Selecciona una categoría" /></SelectTrigger>
              <SelectContent>
                {(categories ?? []).map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input className="mt-2 h-10" placeholder="O agrega una categoría nueva…" maxLength={60}
              value={newCategory} onChange={(e) => { setNewCategory(e.target.value); if (e.target.value) setCategoryId(""); }} disabled={isConverted} />
          </div>

          <div>
            <Label>Proveedor</Label>
            <Select value={vendorId ?? ""} onValueChange={(v) => { setVendorId(v); setNewVendor(""); }} disabled={isConverted}>
              <SelectTrigger className="h-11"><SelectValue placeholder="Selecciona un proveedor (opcional)" /></SelectTrigger>
              <SelectContent>
                {(vendors ?? []).map((v: any) => (
                  <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input className="mt-2 h-10" placeholder="O agrega un proveedor nuevo…" maxLength={80}
              value={newVendor} onChange={(e) => { setNewVendor(e.target.value); if (e.target.value) setVendorId(null); }} disabled={isConverted} />
          </div>

          {isLaborCategory && (
            <div>
              <Label>Trabajador</Label>
              <Select value={workerId ?? "__none"} onValueChange={(value) => setWorkerId(value === "__none" ? null : value)} disabled={isConverted}>
                <SelectTrigger className="h-11"><SelectValue placeholder="Selecciona un trabajador" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Sin asignar</SelectItem>
                  {(workers ?? []).map((worker: any) => (
                    <SelectItem key={worker.id} value={worker.id}>{worker.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">Se guardará en el gasto cuando la categoría corresponda a mano de obra.</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Método de pago</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod} disabled={isConverted}>
                <SelectTrigger className="h-11"><SelectValue placeholder="Selecciona un método" /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Últimos 4 de tarjeta</Label>
              <Input className="h-11" inputMode="numeric" maxLength={4} placeholder="••••"
                value={last4} onChange={(e) => setLast4(e.target.value.replace(/\D/g, "").slice(0, 4))} disabled={isConverted} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Subtotal</Label>
              <Input type="number" inputMode="decimal" min="0" step="0.01" className="h-11"
                value={subtotal} onChange={(e) => setSubtotal(e.target.value)} placeholder="0.00" disabled={isConverted} />
            </div>
            <div>
              <Label>Impuesto</Label>
              <Input type="number" inputMode="decimal" min="0" step="0.01" className="h-11"
                value={tax} onChange={(e) => setTax(e.target.value)} placeholder="0.00" disabled={isConverted} />
            </div>
          </div>

          {lineItems.length > 0 && (
            <div className="rounded-lg border">
              <div className="flex items-center justify-between border-b px-3 py-2">
                <p className="text-sm font-medium">Partidas detectadas ({lineItems.length})</p>
                {!isConverted && (
                  <Button size="sm" variant="ghost" onClick={() => setLineItems([])}>
                    <Trash2 className="mr-1 h-3 w-3" /> Limpiar
                  </Button>
                )}
              </div>
              <div className="max-h-56 overflow-y-auto divide-y">
                {lineItems.map((li, idx) => (
                  <div key={idx} className="flex items-center gap-2 px-3 py-2 text-xs">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{li.description}</p>
                      <p className="text-muted-foreground">
                        {li.quantity != null ? `${li.quantity} × ` : ""}
                        {li.unit_price != null ? usd(Number(li.unit_price)) : ""}
                      </p>
                    </div>
                    <p className="font-semibold tabular-nums">
                      {li.total != null ? usd(Number(li.total)) : "—"}
                    </p>
                    {!isConverted && (
                      <Button size="icon" variant="ghost" className="h-7 w-7"
                        onClick={() => setLineItems((prev) => prev.filter((_, i) => i !== idx))}>
                        <XCircle className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <Label>Descripción</Label>
            <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} placeholder="¿Para qué fue este gasto?" disabled={isConverted} />
          </div>

          <div>
            <Label>Notas internas</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} placeholder="Notes for review (not shown on expense)" disabled={isConverted} />
          </div>

          {/* Duplicate warning */}
          {!isConverted && dup.data && dup.data.length > 0 && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Posible gasto duplicado</AlertTitle>
              <AlertDescription className="space-y-2">
                <p>Ya existe un gasto con proyecto, proveedor, monto y fecha similares.</p>
                <ul className="space-y-1 text-xs">
                  {dup.data.slice(0, 3).map((e: any) => (
                    <li key={e.id} className="flex items-center justify-between rounded border bg-background/40 p-2">
                      <span className="truncate">{e.vendors?.name ?? "—"} · {e.projects?.name ?? "Sin asignar"}</span>
                      <span>{usd(Number(e.amount))} · {e.spent_on}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex gap-2 pt-1">
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => { setPickedExpenseId(dup.data![0].id); setLinkOpen(true); }}>
                    Asociar al existente
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Action buttons */}
          {!isConverted && (
            <div className="sticky bottom-0 z-10 -mx-4 space-y-2 border-t bg-background/95 px-4 pb-[env(safe-area-inset-bottom)] pt-3 backdrop-blur">
              <Button className="h-12 w-full text-base" onClick={handleCreateExpense} disabled={submitting}>
                {convert.isPending ? "Creando gasto…" : "Crear gasto desde recibo"}
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" className="h-11" onClick={() => setLinkOpen(true)} disabled={submitting}>
                  <Link2 className="mr-1 h-4 w-4" /> Asociar existente
                </Button>
                <Button variant="outline" className="h-11" onClick={handleKeepUnassigned} disabled={submitting}>
                  Guardar pendiente
                </Button>
                <Button variant="outline" className="h-11" onClick={handleSaveDraft} disabled={submitting}>
                  Guardar borrador
                </Button>
                <Button variant="outline" className="h-11" onClick={() => replaceInputRef.current?.click()} disabled={submitting}>
                  <UploadCloud className="mr-1 h-4 w-4" /> Reemplazar archivo
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" className="h-11 border-warning text-warning-foreground" onClick={handleReject} disabled={submitting}>
                  <XCircle className="mr-1 h-4 w-4" /> Rechazar
                </Button>
                <DeleteConfirm onConfirm={handleDelete} disabled={submitting} />
              </div>
            </div>
          )}

          {isConverted && (
            <div className="space-y-2 pt-1">
              <Alert>
                <AlertTitle>Este recibo ya se convirtió en gasto</AlertTitle>
                <AlertDescription>Puedes desasociarlo o eliminar el recibo.</AlertDescription>
              </Alert>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" className="h-11" onClick={async () => {
                  await link.mutateAsync({ id: receipt.id, expenseId: null });
                }}>
                  Desasociar gasto
                </Button>
                <DeleteConfirm onConfirm={handleDelete} disabled={submitting} />
              </div>
            </div>
          )}

          {isRejected && (
            <Button variant="outline" className="h-11 w-full" onClick={async () => {
              await setStatus.mutateAsync({ id: receipt.id, status: "needs_review" });
            }}>
              Restaurar para revisión
            </Button>
          )}
        </div>

        {/* Link existing expense dialog */}
        <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Asociar recibo a un gasto</DialogTitle>
              <DialogDescription className="sr-only">Selecciona el gasto existente al que deseas asociar este recibo.</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Input placeholder="Buscar proveedor, monto o proyecto…" value={expenseQuery} onChange={(e) => setExpenseQuery(e.target.value)} />
              <div className="max-h-72 space-y-1 overflow-y-auto">
                {filteredExpenses.length === 0 && (
                  <p className="p-3 text-center text-sm text-muted-foreground">No se encontraron gastos.</p>
                )}
                {filteredExpenses.map((e: any) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => setPickedExpenseId(e.id)}
                    className={`w-full rounded border p-2 text-left text-sm ${pickedExpenseId === e.id ? "border-primary bg-primary/10" : "hover:bg-muted"}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">{e.vendors?.name ?? "—"}</span>
                      <span>{usd(Number(e.amount))}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="truncate">{e.projects?.name ?? "Sin asignar"} · {e.categories?.name ?? "—"}</span>
                      <span>{e.spent_on}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setLinkOpen(false)}>Cancelar</Button>
              <Button onClick={handleLinkExisting} disabled={!pickedExpenseId || link.isPending}>
                {link.isPending ? "Asociando…" : "Asociar recibo"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </SheetContent>
    </Sheet>
  );
}

function DeleteConfirm({ onConfirm, disabled }: { onConfirm: () => void | Promise<void>; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" className="h-11 border-destructive text-destructive" onClick={() => setOpen(true)} disabled={disabled}>
        <Trash2 className="mr-1 h-4 w-4" /> Eliminar
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar recibo?</AlertDialogTitle>
            <AlertDialogDescription>El archivo se eliminará del almacenamiento. Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setOpen(false); onConfirm(); }}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default ReceiptReviewSheet;
