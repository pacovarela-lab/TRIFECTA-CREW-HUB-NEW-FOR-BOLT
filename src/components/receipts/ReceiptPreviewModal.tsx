import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { createReceiptObjectUrl } from "@/hooks/useTrifectaData";
import { PdfReceiptViewer } from "@/components/receipts/PdfReceiptViewer";
import { toast } from "sonner";

interface ReceiptPreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filePath?: string | null;
  storagePath?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
}

export const ReceiptPreviewModal = ({
  open,
  onOpenChange,
  filePath,
  storagePath,
  fileName,
  mimeType,
}: ReceiptPreviewModalProps) => {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("No se pudo mostrar la vista previa. Descarga el archivo.");

  useEffect(() => {
    if (!open || (!storagePath && !filePath)) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    setLoading(true);
    setError(false);
    setUrl(null);
    setErrorMessage("No se pudo mostrar la vista previa. Descarga el archivo.");
    createReceiptObjectUrl({ storagePath, fileUrl: filePath, mimeType })
      .then(({ url: u }) => {
        objectUrl = u;
        if (cancelled) {
          URL.revokeObjectURL(u);
          return;
        }
        if (!cancelled) setUrl(u);
      })
      .catch((err) => {
        if (!cancelled) {
          setErrorMessage(err?.message || "No se pudo mostrar la vista previa. Descarga el archivo.");
          setError(true);
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [open, filePath, storagePath, mimeType]);

  const isImage = mimeType?.startsWith("image/");
  const isPdf = mimeType === "application/pdf";

  const handleDownload = async () => {
    if (!url) return;
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
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="truncate pr-8">{fileName || "Vista previa del recibo"}</DialogTitle>
          <DialogDescription className="sr-only">Vista previa segura del archivo del recibo.</DialogDescription>
        </DialogHeader>

        <div className="min-h-[50vh] w-full overflow-hidden rounded-md border bg-muted">
          {loading && (
            <div className="flex h-[50vh] items-center justify-center text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Cargando vista previa…
            </div>
          )}

          {!loading && (error || !url) && (
            <div className="flex h-[50vh] items-center justify-center p-6 text-center text-sm text-muted-foreground">
              {errorMessage}
            </div>
          )}

          {!loading && url && !error && isImage && (
            <div className="flex h-[70vh] items-center justify-center bg-background">
              <img
                src={url}
                alt={fileName || "Recibo"}
                className="max-h-full max-w-full object-contain"
                onError={() => setError(true)}
              />
            </div>
          )}

          {!loading && url && !error && isPdf && (
            <PdfReceiptViewer url={url} fileName={fileName} className="h-[70vh] w-full" />
          )}

          {!loading && url && !error && !isImage && !isPdf && (
            <div className="flex h-[50vh] items-center justify-center p-6 text-center text-sm text-muted-foreground">
              Este tipo de archivo no admite vista previa. Descárgalo para revisarlo.
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button onClick={handleDownload} disabled={!url}>
            <Download className="mr-1 h-4 w-4" /> Descargar archivo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ReceiptPreviewModal;
