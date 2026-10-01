import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from "pdfjs-dist";

GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

interface PdfReceiptViewerProps {
  url: string;
  fileName?: string | null;
  className?: string;
}

export function PdfReceiptViewer({ url, fileName, className }: PdfReceiptViewerProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [width, setWidth] = useState(0);
  const [loading, setLoading] = useState(true);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const node = wrapperRef.current;
    if (!node) return;
    const updateWidth = () => setWidth(node.clientWidth);
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let loadedPdf: PDFDocumentProxy | null = null;
    const task = getDocument({ url });

    setLoading(true);
    setError(null);
    setPdf(null);
    setPageNumber(1);
    setPageCount(0);

    task.promise
      .then((doc) => {
        loadedPdf = doc;
        if (cancelled) {
          void doc.destroy();
          return;
        }
        setPdf(doc);
        setPageCount(doc.numPages);
      })
      .catch(() => {
        if (!cancelled) setError("PDF preview unavailable. Please download the file.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      task.destroy();
      if (loadedPdf) void loadedPdf.destroy();
    };
  }, [url]);

  useEffect(() => {
    if (!pdf || !canvasRef.current) return;
    let cancelled = false;
    let renderTask: { cancel: () => void; promise: Promise<unknown> } | null = null;

    setRendering(true);
    pdf.getPage(pageNumber)
      .then((page) => {
        if (cancelled || !canvasRef.current) return;
        const baseViewport = page.getViewport({ scale: 1 });
        const availableWidth = Math.max((width || 640) - 24, 280);
        const scale = Math.min(2, Math.max(0.45, availableWidth / baseViewport.width));
        const ratio = window.devicePixelRatio || 1;
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        const context = canvas.getContext("2d");
        if (!context) return;

        canvas.width = Math.floor(viewport.width * ratio);
        canvas.height = Math.floor(viewport.height * ratio);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        renderTask = page.render({ canvas, canvasContext: context, viewport });
        return renderTask.promise;
      })
      .catch((err) => {
        if (!cancelled && err?.name !== "RenderingCancelledException") {
          setError("PDF preview unavailable. Please download the file.");
        }
      })
      .finally(() => {
        if (!cancelled) setRendering(false);
      });

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [pdf, pageNumber, width]);

  return (
    <div ref={wrapperRef} className={className}>
      {(loading || rendering) && (
        <div className="flex h-full min-h-56 items-center justify-center text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading preview…
        </div>
      )}

      {!loading && error && (
        <div className="flex h-full min-h-56 items-center justify-center px-4 text-center text-sm text-muted-foreground">
          {error}
        </div>
      )}

      {!loading && !error && (
        <div className="flex h-full flex-col bg-background">
          <div className="min-h-0 flex-1 overflow-auto p-3">
            <canvas ref={canvasRef} aria-label={fileName || "Receipt PDF"} className="mx-auto block shadow-sm" />
          </div>
          {pageCount > 1 && (
            <div className="flex items-center justify-center gap-3 border-t bg-background p-2">
              <Button size="icon" variant="ghost" onClick={() => setPageNumber((p) => Math.max(1, p - 1))} disabled={pageNumber <= 1} aria-label="Previous page">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs text-muted-foreground">{pageNumber} / {pageCount}</span>
              <Button size="icon" variant="ghost" onClick={() => setPageNumber((p) => Math.min(pageCount, p + 1))} disabled={pageNumber >= pageCount} aria-label="Next page">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default PdfReceiptViewer;