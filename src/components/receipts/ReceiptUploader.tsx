import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Upload, FileText, Image as ImageIcon, Trash2, Eye, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  RECEIPT_ALLOWED_MIME,
  RECEIPT_MAX_BYTES,
  getReceiptMimeType,
  useDeleteReceipt,
  useUploadReceipt,
} from "@/hooks/useTrifectaData";
import { ReceiptPreviewModal } from "@/components/receipts/ReceiptPreviewModal";
import { supabase } from "@/integrations/supabase/client";
import { extractReceiptText } from "@/lib/receiptText";
import { prepareReceiptFile, isHeicLike } from "@/lib/imagePrep";
import { parseReceiptOcrResponse, withReceiptOcrTimeout } from "@/lib/receiptOcr";
import { sha256File } from "@/lib/fileHash";
import { findDuplicateReceipt } from "@/hooks/useDuplicateReceipt";

interface AttachedReceipt {
  id: string;
  file_url: string;
  storage_path?: string | null;
  file_name: string | null;
  mime_type: string | null;
  file_size?: number | null;
}

export interface ParsedReceipt {
  vendor?: string | null;
  amount?: number | null;
  spent_on?: string | null;
  category?: string | null;
  description?: string | null;
  confidence: number;
}

interface Props {
  expenseId?: string | null;
  divisionId?: string | null;
  receipt?: AttachedReceipt | null;
  onUploaded?: (receipt: AttachedReceipt) => void;
  onRemoved?: () => void;
  onParsed?: (parsed: ParsedReceipt) => void;
  autoExtract?: boolean;
}

const fmtSize = (bytes?: number | null) => {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

export function ReceiptUploader({ expenseId, divisionId, receipt, onUploaded, onRemoved, onParsed, autoExtract = true }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = useUploadReceipt();
  const del = useDeleteReceipt();
  const [progress, setProgress] = useState(0);
  const [extracting, setExtracting] = useState(false);

  const fileToDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(file);
    });

  const runExtract = async (file: File) => {
    if (!onParsed) return;
    setExtracting(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      const ocrText = await extractReceiptText(file).catch(() => "");
      const { data, error } = await withReceiptOcrTimeout(supabase.functions.invoke("process-receipt", {
        body: { fileDataUrl: dataUrl, ocrText },
      }));
      if (error) throw error;
      const parsed = parseReceiptOcrResponse(data) as ParsedReceipt;
      onParsed(parsed);
      if (parsed?.amount) {
        toast.success(`Detectado: $${parsed.amount}${parsed.vendor ? ` · ${parsed.vendor}` : ""}`);
      }
    } catch (e) {
      console.warn("OCR extract failed", e);
      toast.warning("El recibo se subió, pero no se pudo leer", {
        description: "Completa los datos manualmente o vuelve a intentar.",
      });
    } finally {
      setExtracting(false);
    }
  };

  const handleSelect = async (rawFile: File | undefined) => {
    if (!rawFile) return;
    if (!RECEIPT_ALLOWED_MIME.includes(getReceiptMimeType(rawFile))) {
      toast.error("Solo JPG, PNG, HEIC o PDF");
      return;
    }
    if (rawFile.size > RECEIPT_MAX_BYTES) {
      toast.error("El archivo excede 10 MB");
      return;
    }
    setProgress(5);
    try {
      const file = await prepareReceiptFile(rawFile);
      if (isHeicLike(rawFile) && !isHeicLike(file)) {
        toast.message("HEIC convertido a JPG");
      }
      const fileHash = await sha256File(file);
      const duplicate = await findDuplicateReceipt({ hash: fileHash });
      if (duplicate && duplicate.id !== receipt?.id) {
        toast.warning("Este recibo ya fue subido", {
          description: "Usa el recibo existente para evitar duplicados.",
        });
        return;
      }
      const r = await upload.mutateAsync({
        file,
        expenseId: expenseId ?? null,
        divisionId: divisionId ?? null,
        fileHash,
        onProgress: setProgress,
      });
      onUploaded?.(r as AttachedReceipt);
      if (autoExtract && onParsed) void runExtract(file);
    } catch {
      // toast handled in hook
    } finally {
      setProgress(0);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const [previewOpen, setPreviewOpen] = useState(false);


  const handleRemove = async () => {
    if (!receipt) return;
    await del.mutateAsync({ id: receipt.id, path: receipt.storage_path ?? receipt.file_url });
    onRemoved?.();
  };

  const isImage = receipt?.mime_type?.startsWith("image/");

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/heic,image/heif,application/pdf"
        className="hidden"
        onChange={(e) => handleSelect(e.target.files?.[0])}
      />

      {receipt ? (
        <div className="flex items-center gap-3 rounded-lg border p-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-muted">
            {isImage ? <ImageIcon className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{receipt.file_name ?? "Recibo"}</p>
            <p className="text-xs text-muted-foreground">{fmtSize(receipt.file_size)}</p>
          </div>
          <Button size="icon" variant="ghost" onClick={() => setPreviewOpen(true)} aria-label="Vista previa" className="min-h-11 min-w-11"><Eye className="h-4 w-4" /></Button>
          <Button size="icon" variant="ghost" onClick={() => inputRef.current?.click()} aria-label="Reemplazar" disabled={upload.isPending} className="min-h-11 min-w-11"><Upload className="h-4 w-4" /></Button>
          <Button size="icon" variant="ghost" onClick={handleRemove} aria-label="Quitar" disabled={del.isPending} className="min-h-11 min-w-11"><Trash2 className="h-4 w-4 text-destructive" /></Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          className="h-11 w-full"
          onClick={() => inputRef.current?.click()}
          disabled={upload.isPending}
        >
          <Upload className="mr-2 h-4 w-4" />
          {upload.isPending ? "Subiendo…" : "Subir recibo"}
        </Button>
      )}

      {upload.isPending && progress > 0 && (
        <Progress value={progress} className="h-2" />
      )}
      {extracting && (
        <p className="flex items-center gap-1.5 text-xs text-primary">
          <Sparkles className="h-3 w-3 animate-pulse" /> Analizando recibo con IA…
        </p>
      )}
      <p className="text-xs text-muted-foreground">JPG, PNG, HEIC o PDF · máx 10 MB</p>

      {receipt && (
        <ReceiptPreviewModal
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          filePath={receipt.file_url}
          storagePath={receipt.storage_path}
          fileName={receipt.file_name}
          mimeType={receipt.mime_type}
        />
      )}
    </div>
  );
}
