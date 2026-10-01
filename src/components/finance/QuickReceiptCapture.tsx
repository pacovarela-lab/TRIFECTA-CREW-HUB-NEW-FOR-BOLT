/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Camera, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useCategories,
  useUpdateReceipt,
  useUploadReceipt,
  useVendors,
  RECEIPT_ALLOWED_MIME,
  RECEIPT_MAX_BYTES,
  getReceiptMimeType,
} from "@/hooks/useTrifectaData";
import { sha256File } from "@/lib/fileHash";
import { findDuplicateReceipt } from "@/hooks/useDuplicateReceipt";
import { supabase } from "@/integrations/supabase/client";
import { extractReceiptText } from "@/lib/receiptText";
import { prepareReceiptFile, isHeicLike } from "@/lib/imagePrep";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { parseReceiptOcrResponse, withReceiptOcrTimeout } from "@/lib/receiptOcr";
import { claimQueuedReceipt, listQueuedReceipts, markQueuedReceiptFailed, queueReceipt, removeQueuedReceipt, retryQueuedReceipt, upgradeQueuedReceipt } from "@/lib/offlineReceiptQueue";
import { executeReceiptCapture } from "@/lib/mobileReceiptCaptureFlow";
import { syncOfflineReceiptDrafts } from "@/lib/offlineReceiptSync";

/**
 * Botón flotante de captura rápida: abre cámara nativa, sube y avisa duplicados.
 * El recibo queda en estado `needs_review` para asignar luego.
 */
type QuickReceiptCaptureProps = {
  captureRequest?: number;
  /**
   * iOS Safari only opens the camera when the file input is clicked inside the
   * original user gesture. Callers store this trigger and call it synchronously
   * from their own onClick instead of relying on captureRequest.
   */
  captureTriggerRef?: React.MutableRefObject<(() => void) | null>;
  showButton?: boolean;
  buttonClassName?: string;
  projectId?: string | null;
};

export function QuickReceiptCapture({ captureRequest = 0, captureTriggerRef, showButton = true, buttonClassName, projectId }: QuickReceiptCaptureProps) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastCaptureRequest = useRef(0);
  const ownerRef = useRef<{ userId: string; companyId: string } | null>(null);
  const syncingRef = useRef(false);
  const capturingRef = useRef(false);
  const upload = useUploadReceipt();
  const updateReceipt = useUpdateReceipt();
  const { data: vendors } = useVendors();
  const { data: categories } = useCategories("expense");
  const [working, setWorking] = useState(false);
  const [stage, setStage] = useState<"preparing" | "uploading" | "reading" | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const sync = async () => {
      if (!navigator.onLine || working || syncingRef.current) return;
      syncingRef.current = true;
      try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from("profiles").select("company_id").eq("id", user.id).maybeSingle();
      if (!profile?.company_id) return;
      ownerRef.current = { userId: user.id, companyId: profile.company_id };
      const queued = await listQueuedReceipts(user.id, profile.company_id).catch(() => []);
      await syncOfflineReceiptDrafts({
        drafts: queued,
        claim: (draft) => claimQueuedReceipt(draft.id, user.id, profile.company_id),
        upgrade: (draft) => upgradeQueuedReceipt(draft, user.id, profile.company_id),
        findDuplicate: (hash) => findDuplicateReceipt({ hash }),
        upload: async (file, hash) => { await upload.mutateAsync({ file, expenseId: null, divisionId: null, fileHash: hash }); },
        remove: async (draft) => {
          await removeQueuedReceipt(draft.id, user.id, profile.company_id);
          toast.success("Recibo pendiente guardado");
        },
        fail: async (draft, error, retryable) => {
          const code = error instanceof Error ? error.name || "sync_failed" : "sync_failed";
          const failed = await markQueuedReceiptFailed(draft, code, retryable);
          if (failed.status === "failed") {
            toast.error("Un recibo pendiente necesita atención", {
              action: { label: "Reintentar", onClick: () => { void retryQueuedReceipt(draft.id, user.id, profile.company_id).then(sync); } },
            });
          }
        },
      });
      } finally {
        syncingRef.current = false;
      }
    };
    window.addEventListener("online", sync); void sync();
    return () => window.removeEventListener("online", sync);
  // Queue subscription is intentionally registered once; mutation identity is not stable.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!captureTriggerRef) return;
    captureTriggerRef.current = () => { if (!capturingRef.current) cameraInputRef.current?.click(); };
    return () => { captureTriggerRef.current = null; };
  }, [captureTriggerRef]);

  useEffect(() => {
    if (!working && captureRequest > 0 && captureRequest !== lastCaptureRequest.current) {
      lastCaptureRequest.current = captureRequest;
      cameraInputRef.current?.click();
    }
  }, [captureRequest, working]);

  const norm = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

  const fileToDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(file);
    });

  const onFile = async (rawFile?: File) => {
    if (!rawFile || working || capturingRef.current) return;
    capturingRef.current = true;
    // Validar contra el original (HEIC entra por extensión)
    if (!RECEIPT_ALLOWED_MIME.includes(getReceiptMimeType(rawFile))) {
      toast.error("Solo JPG, PNG, HEIC o PDF");
      capturingRef.current = false;
      return;
    }
    if (rawFile.size > RECEIPT_MAX_BYTES) {
      toast.error("Archivo mayor a 10 MB");
      capturingRef.current = false;
      return;
    }
    setWorking(true);
    setStage("preparing");
    try {
      // Convertir HEIC y comprimir antes de subir (iPhone)
      const preparedFile = await prepareReceiptFile(rawFile);
      if (isHeicLike(rawFile) && !isHeicLike(preparedFile)) {
        toast.message("HEIC convertido a JPG");
      }
      const preparedHash = await sha256File(preparedFile);
      let detectedAmount: number | null = null;
      let ocrFailed = false;
      const result = await executeReceiptCapture({
        preparedFile,
        preparedHash,
        online: () => navigator.onLine,
        findDuplicate: (hash) => findDuplicateReceipt({ hash }),
        upload: async (file, hash) => {
          setStage("uploading");
          return upload.mutateAsync({ file, expenseId: null, divisionId: null, projectId: projectId ?? null, fileHash: hash }) as Promise<{ id: string }>;
        },
        queue: async (file, hash) => {
          let owner = ownerRef.current;
          if (!owner && navigator.onLine) {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
              const { data: profile } = await supabase.from("profiles").select("company_id").eq("id", user.id).maybeSingle();
              if (profile?.company_id) owner = { userId: user.id, companyId: profile.company_id };
            }
          }
          if (!owner) throw new Error("offline_owner_required");
          await queueReceipt(file, hash, owner.userId, owner.companyId);
        },
        postProcess: async (receiptId, file, hash) => {
          const patch: Record<string, any> = { file_hash: hash };
          try {
            setStage("reading");
            const dataUrl = await fileToDataUrl(file);
            const ocrText = await extractReceiptText(file).catch(() => "");
            const { data, error: ocrErr } = await withReceiptOcrTimeout(supabase.functions.invoke("process-receipt", {
              body: { fileDataUrl: dataUrl, ocrText, knownCategories: (categories ?? []).map((c: any) => c.name), knownVendors: (vendors ?? []).map((v: any) => v.name) },
            }));
            if (ocrErr) throw ocrErr;
            const parsed = parseReceiptOcrResponse(data);
            const matchedVendor = parsed?.vendor ? (vendors ?? []).find((v: any) => norm(v.name) === norm(parsed.vendor)) : null;
            const matchedCategory = parsed?.category ? (categories ?? []).find((c: any) => norm(c.name) === norm(parsed.category)) : null;
            if (parsed?.amount != null) { patch.amount = parsed.amount; detectedAmount = Number(parsed.amount); }
            if (parsed?.spent_on) patch.spent_on = parsed.spent_on;
            if (parsed?.description) patch.description = parsed.description;
            if (matchedVendor?.id) patch.vendor_id = matchedVendor.id;
            if (matchedCategory?.id) patch.category_id = matchedCategory.id;
            if (matchedVendor?.id && detectedAmount != null && parsed?.spent_on) {
              const dupFp = await findDuplicateReceipt({ vendorId: matchedVendor.id, amount: detectedAmount, spentOn: parsed.spent_on });
              if (dupFp && dupFp.id !== receiptId) toast.warning("⚠️ Posible duplicado del mismo proveedor, monto y fecha", { description: "Revísalo antes de confirmarlo." });
            }
          } catch (ocrError) {
            console.warn("OCR failed, receipt saved for review", ocrError);
            ocrFailed = true;
          }
          await updateReceipt.mutateAsync({ id: receiptId, patch });
        },
      });

      if (result.status === "duplicate") {
        const dup = result.duplicate as any;
        toast.warning("⚠️ Este recibo ya fue subido antes", {
          description: dup.amount ? `$${dup.amount} · ${dup.spent_on ?? ""}` : undefined,
        });
        return;
      }
      if (result.status === "queued") {
        toast.warning("Guardado en dispositivo", { description: "Pendiente de sincronizar. Se reintentará al recuperar conexión." });
        return;
      }
      if (result.status === "failed") {
        toast.error("No pudimos guardar el recibo.");
        return;
      }
      if (result.postProcessingFailed) {
        toast.warning("Recibo guardado", { description: "El archivo se guardó correctamente, pero parte del procesamiento quedó pendiente." });
      } else
      if (ocrFailed) {
        toast.warning("Recibo guardado, pero no se pudo leer", {
          description: "Ábrelo para revisar los datos o vuelve a intentar la lectura.",
        });
      } else {
        toast.success(detectedAmount ? `Listo para revisar · $${detectedAmount}` : "Listo para revisar");
      }
      // Lleva al usuario directo a asignar proyecto/división → expense
      navigate(`/receipts?review=${result.receiptId}`);
    } catch (e: any) {
      toast.error(e?.message === "offline_owner_required" ? "Abre la captura una vez con conexión antes de usarla sin red" : "No pudimos guardar el recibo.");
    } finally {
      setWorking(false);
      setStage(null);
      if (cameraInputRef.current) cameraInputRef.current.value = "";
      if (fileInputRef.current) fileInputRef.current.value = "";
      capturingRef.current = false;
    }
  };

  return (
    <>
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="absolute h-px w-px opacity-0"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => onFile(e.target.files?.[0])}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,image/heic,image/heif,application/pdf"
        className="absolute h-px w-px opacity-0"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => onFile(e.target.files?.[0])}
      />
      {showButton && (
        <Button
          onClick={() => cameraInputRef.current?.click()}
          disabled={working}
          size="icon"
          className={cn("fixed bottom-20 left-4 z-40 h-14 w-14 rounded-full shadow-lg safe-bottom md:bottom-6 md:left-6", buttonClassName)}
          aria-label="Capturar recibo"
        >
          {working ? <Loader2 className="h-6 w-6 animate-spin" /> : <Camera className="h-6 w-6" />}
        </Button>
      )}
      {working && stage && (
        <div className="fixed inset-x-4 bottom-24 z-[60] mx-auto flex max-w-sm items-center justify-center gap-2 rounded-full bg-foreground px-4 py-3 text-sm font-semibold text-background shadow-xl md:bottom-6">
          <Loader2 className="h-4 w-4 animate-spin" />
          {stage === "preparing" ? "Preparando recibo…" : stage === "uploading" ? "Subiendo recibo…" : "Leyendo recibo…"}
        </div>
      )}
    </>
  );
}
