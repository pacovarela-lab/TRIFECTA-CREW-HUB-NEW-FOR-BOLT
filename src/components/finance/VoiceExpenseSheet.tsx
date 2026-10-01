import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Check, Loader2, Mic, RotateCcw, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ExpenseSheet } from "@/components/finance/ExpenseSheet";
import { useCategories, useProjects, useVendors, useWorkers } from "@/hooks/useTrifectaData";
import { supabase } from "@/integrations/supabase/client";
import { PAYMENT_METHODS } from "@/lib/enums";
import {
  resolveVoiceExpense,
  voiceExpenseSchema,
  type VoiceCatalogs,
  type VoiceExpense,
} from "@/lib/voiceExpense";

interface Props {
  open: boolean;
  onOpenChange: (value: boolean) => void;
}

type Phase = "idle" | "recording" | "processing" | "review";
type VoiceInitialValues = {
  amount?: number;
  spent_on: string;
  description: string;
  project_id: string | null;
  division_id: string;
  unassigned: boolean;
  vendor_id: string | null;
  category_id: string | null;
  worker_id: string | null;
  voice_review: {
    transcript: string;
    needs_review: string[];
    warnings: string[];
    confidences: Record<string, number>;
    subcategory: string | null;
    payment_method: string | null;
  };
};
const MAX_SECONDS = 60;
const SILENCE_MS = 2500;
const REQUEST_TIMEOUT_MS = 30000;
const MIN_BLOB_BYTES = 1000;

const supportedMimeType = () => {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/mp4;codecs=mp4a.40.2",
    "audio/mp4",
    "audio/webm",
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
};

const getRecorderError = (error: unknown) => {
  const name = (error as DOMException)?.name;
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "El permiso del micrófono fue denegado. Actívalo en los ajustes del navegador y vuelve a intentarlo.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "No encontramos un micrófono disponible en este dispositivo.";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "El micrófono está siendo usado por otra aplicación. Ciérrala y vuelve a intentarlo.";
  }
  return "No pudimos iniciar el micrófono. Revisa los permisos y vuelve a intentarlo.";
};

const getRequestError = (error: unknown) => {
  const message = error instanceof Error ? error.message : "";
  if (message === "VOICE_TIMEOUT") return "La lectura tardó demasiado. Puedes reintentar con la misma grabación.";
  if (/jwt|unauthorized|401|session/i.test(message)) return "Tu sesión venció. Inicia sesión de nuevo y repite el envío.";
  if (/invalid|structured|json|respuesta/i.test(message)) return "La respuesta no se pudo interpretar. Reintenta o repite el dictado.";
  if (typeof navigator !== "undefined" && !navigator.onLine) return "No hay conexión. Conéctate a internet y reintenta.";
  return "No pudimos procesar el audio por un problema de red. Puedes reintentar.";
};

export function VoiceExpenseSheet({ open, onOpenChange }: Props) {
  const { data: projects = [] } = useProjects();
  const { data: workers = [] } = useWorkers({ activeOnly: true });
  const { data: vendors = [] } = useVendors();
  const { data: categories = [] } = useCategories("expense");
  const [phase, setPhase] = useState<Phase>("idle");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VoiceExpense | null>(null);
  const [lastBlob, setLastBlob] = useState<{ blob: Blob; mime: string } | null>(null);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [initialValues, setInitialValues] = useState<VoiceInitialValues | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserFrameRef = useRef<number | null>(null);
  const silenceStartRef = useRef<number | null>(null);
  const sendingRef = useRef(false);
  const heardAudioRef = useRef(false);
  const discardRecordingRef = useRef(false);

  const stopTracks = useCallback(() => {
    if (timerRef.current != null) window.clearInterval(timerRef.current);
    timerRef.current = null;
    if (analyserFrameRef.current != null) cancelAnimationFrame(analyserFrameRef.current);
    analyserFrameRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    void audioContextRef.current?.close();
    audioContextRef.current = null;
    silenceStartRef.current = null;
  }, []);

  const reset = useCallback(() => {
    stopTracks();
    setPhase("idle");
    setSeconds(0);
    setError(null);
    setResult(null);
    setInitialValues(null);
    setLastBlob(null);
    chunksRef.current = [];
    sendingRef.current = false;
    heardAudioRef.current = false;
    discardRecordingRef.current = false;
  }, [stopTracks]);

  useEffect(() => {
    if (!open) reset();
    return () => stopTracks();
  }, [open, reset, stopTracks]);

  const catalogs: VoiceCatalogs = {
    projects: projects as VoiceCatalogs["projects"],
    workers,
    vendors,
    categories,
    paymentMethods: PAYMENT_METHODS,
  };

  const buildInitialValues = (voice: VoiceExpense) => {
    const project = projects.find((item) => item.id === voice.project.matched_id);
    const vendor = vendors.find((item) => item.name === voice.vendor.normalized);
    const date = voice.date.value && /^\d{4}-\d{2}-\d{2}$/.test(voice.date.value) ? voice.date.value : undefined;
    return {
      amount: voice.amount.value ?? undefined,
      spent_on: date ?? "",
      description: voice.description.value ?? "",
      project_id: project?.id ?? null,
      division_id: project?.division_id ?? "",
      unassigned: false,
      vendor_id: vendor?.id ?? null,
      category_id: categories.some((item) => item.id === voice.category.matched_id)
        ? voice.category.matched_id
        : null,
      worker_id: workers.some((item) => item.id === voice.paid_by.matched_worker_id)
        ? voice.paid_by.matched_worker_id
        : null,
      voice_review: {
        transcript: voice.transcript,
        needs_review: voice.needs_review,
        warnings: voice.warnings,
        confidences: {
          proveedor: voice.vendor.confidence,
          monto: voice.amount.confidence,
          proyecto: voice.project.confidence,
          categoría: voice.category.confidence,
          subcategoría: voice.subcategory.confidence,
          trabajador: voice.paid_by.confidence,
          método: voice.payment_method.confidence,
          descripción: voice.description.confidence,
          fecha: voice.date.confidence,
        },
        subcategory: voice.subcategory.matched_name,
        payment_method: voice.payment_method.matched_value,
      },
    };
  };

  const blobToDataUrl = (blob: Blob) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("No se pudo leer la grabación."));
      reader.readAsDataURL(blob);
    });

  const processBlob = async (recording: { blob: Blob; mime: string }) => {
    if (sendingRef.current) return;
    sendingRef.current = true;
    setPhase("processing");
    setError(null);
    try {
      if (recording.blob.size < MIN_BLOB_BYTES) throw new Error("EMPTY_AUDIO");
      setLastBlob(recording);
      const audioDataUrl = await blobToDataUrl(recording.blob);
      const request = supabase.functions.invoke("voice-to-expense", {
        body: {
          audioDataUrl,
          catalogs: {
            projects: projects.map((project) => ({
              id: project.id,
              name: project.name,
              code: project.project_code,
              client: project.clients?.name,
              address: project.address ?? (project.clients as any)?.address,
              status: project.status,
            })),
            workers: workers.map((worker) => ({ id: worker.id, name: worker.name })),
            vendors: vendors.map((vendor) => ({ id: vendor.id, name: vendor.name })),
            categories: categories.map((category) => ({ id: category.id, name: category.name })),
            payment_methods: PAYMENT_METHODS,
          },
        },
      });
      const timeout = new Promise<never>((_, reject) =>
        window.setTimeout(() => reject(new Error("VOICE_TIMEOUT")), REQUEST_TIMEOUT_MS),
      );
      const { data, error: invokeError } = await Promise.race([request, timeout]);
      if (invokeError) throw invokeError;
      const parsed = voiceExpenseSchema.safeParse(data);
      if (!parsed.success) throw new Error("INVALID_STRUCTURED_RESPONSE");
      const resolved = resolveVoiceExpense(parsed.data, catalogs);
      setResult(resolved);
      setInitialValues(buildInitialValues(resolved));
      setPhase("review");
    } catch (requestError) {
      if ((requestError as Error)?.message === "EMPTY_AUDIO") {
        setError("La grabación está vacía o fue demasiado corta. Repite el dictado.");
      } else {
        setError(getRequestError(requestError));
      }
      setPhase("idle");
    } finally {
      sendingRef.current = false;
    }
  };

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    stopTracks();
    setPhase("processing");
    recorder.stop();
  }, [stopTracks]);

  const startSilenceDetection = (stream: MediaStream) => {
    try {
      const AudioContextClass = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;
      const context = new AudioContextClass();
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      context.createMediaStreamSource(stream).connect(analyser);
      audioContextRef.current = context;
      const samples = new Uint8Array(analyser.fftSize);
      const inspect = () => {
        analyser.getByteTimeDomainData(samples);
        const rms = Math.sqrt(samples.reduce((sum, value) => sum + ((value - 128) / 128) ** 2, 0) / samples.length);
        if (rms >= 0.018) heardAudioRef.current = true;
        if (rms < 0.018 && heardAudioRef.current) {
          silenceStartRef.current ??= performance.now();
          if (performance.now() - silenceStartRef.current >= SILENCE_MS) {
            stopRecording();
            return;
          }
        } else {
          silenceStartRef.current = null;
        }
        analyserFrameRef.current = requestAnimationFrame(inspect);
      };
      inspect();
    } catch {
      // La detección de silencio es una mejora opcional; la detención manual permanece disponible.
    }
  };

  const startRecording = async () => {
    if (phase !== "idle" || sendingRef.current) return;
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Este navegador no permite grabar audio. Abre la aplicación en Safari o Chrome actualizado.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = supportedMimeType();
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];
      heardAudioRef.current = false;
      discardRecordingRef.current = false;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        stopTracks();
        setError("La grabación se interrumpió. Repite el dictado.");
        setPhase("idle");
      };
      recorder.onstop = () => {
        if (discardRecordingRef.current) {
          chunksRef.current = [];
          discardRecordingRef.current = false;
          return;
        }
        const actualMime = recorder.mimeType || mime || "audio/webm";
        void processBlob({ blob: new Blob(chunksRef.current, { type: actualMime }), mime: actualMime });
        chunksRef.current = [];
      };
      recorder.start(250);
      setSeconds(0);
      setPhase("recording");
      timerRef.current = window.setInterval(() => {
        setSeconds((current) => {
          if (current >= MAX_SECONDS - 1) stopRecording();
          return Math.min(current + 1, MAX_SECONDS);
        });
      }, 1000);
      startSilenceDetection(stream);
    } catch (recorderError) {
      stopTracks();
      setError(getRecorderError(recorderError));
      setPhase("idle");
    }
  };

  const repeat = () => {
    setResult(null);
    setInitialValues(null);
    setError(null);
    setLastBlob(null);
    setPhase("idle");
  };

  const cancelRecording = () => {
    discardRecordingRef.current = true;
    stopTracks();
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    recorderRef.current = null;
    chunksRef.current = [];
    setSeconds(0);
    setPhase("idle");
  };

  return (
    <>
      <Sheet open={open && !expenseOpen} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto rounded-t-3xl pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          <SheetHeader className="text-left">
            <SheetTitle>Dictar gasto</SheetTitle>
          </SheetHeader>
          <div className="mt-5 flex flex-col items-center gap-5">
            {phase === "idle" && (
              <>
                <p className="max-w-sm text-center text-sm text-muted-foreground">
                  Di proveedor, monto, proyecto, concepto, quién pagó y método. Podrás revisar todo antes de guardar.
                </p>
                <button type="button" onClick={startRecording} className="flex h-28 w-28 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl active:scale-95" aria-label="Comenzar dictado">
                  <Mic className="h-12 w-12" />
                </button>
                <p className="font-semibold">Toca para comenzar</p>
                {error && (
                  <div className="w-full space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
                    <p className="flex gap-2 text-destructive"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</p>
                    {lastBlob && <Button type="button" variant="outline" className="h-11 w-full" onClick={() => void processBlob(lastBlob)}><RotateCcw className="mr-2 h-4 w-4" />Reintentar</Button>}
                  </div>
                )}
              </>
            )}
            {phase === "recording" && (
              <>
                <p className="text-lg font-bold text-destructive">Escuchando</p>
                <button type="button" onClick={stopRecording} className="flex h-28 w-28 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-xl" aria-label="Detener dictado">
                  <Square className="h-11 w-11 fill-current" />
                </button>
                <p className="font-mono text-2xl font-semibold tabular-nums">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</p>
                <p className="text-center text-sm text-muted-foreground">Toca para detener. También se detendrá tras unos segundos de silencio.</p>
                <Button type="button" variant="ghost" className="h-11" onClick={cancelRecording}>
                  <X className="mr-2 h-4 w-4" />Cancelar
                </Button>
              </>
            )}
            {phase === "processing" && (
              <div className="flex flex-col items-center gap-3 py-10">
                <Loader2 className="h-11 w-11 animate-spin text-primary" />
                <p className="text-lg font-bold">Procesando</p>
                <p className="text-sm text-muted-foreground">Estamos escuchando y preparando los datos para revisión.</p>
              </div>
            )}
            {phase === "review" && result && (
              <div className="w-full space-y-4">
                <p className="flex items-center gap-2 text-lg font-bold text-success"><Check className="h-5 w-5" />Listo para revisar</p>
                <div className="rounded-lg border bg-muted/30 p-3">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Transcripción</p>
                  <p className="mt-1 text-sm">“{result.transcript}”</p>
                </div>
                {result.warnings.length > 0 && (
                  <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                    {result.warnings.map((warning) => <p key={warning}>{warning}</p>)}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <ReviewField label="Monto" value={result.amount.value == null ? "Sin detectar" : `$${result.amount.value.toFixed(2)}`} confidence={result.amount.confidence} />
                  <ReviewField label="Proyecto" value={result.project.matched_name ?? result.project.raw ?? "Sin detectar"} confidence={result.project.confidence} />
                  <ReviewField label="Proveedor" value={result.vendor.normalized ?? result.vendor.raw ?? "Sin detectar"} confidence={result.vendor.confidence} />
                  <ReviewField label="Categoría" value={result.category.matched_name ?? result.category.raw ?? "Sin detectar"} confidence={result.category.confidence} />
                  <ReviewField label="Pagó" value={result.paid_by.matched_name ?? result.paid_by.raw ?? "Sin detectar"} confidence={result.paid_by.confidence} />
                  <ReviewField label="Método" value={result.payment_method.matched_value ?? result.payment_method.raw ?? "Sin detectar"} confidence={result.payment_method.confidence} />
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" className="h-11 flex-1" onClick={repeat}>Repetir</Button>
                  <Button type="button" className="h-11 flex-1" onClick={() => setExpenseOpen(true)}>Revisar gasto</Button>
                </div>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
      <ExpenseSheet
        open={expenseOpen}
        onOpenChange={(value) => {
          setExpenseOpen(value);
          if (!value) onOpenChange(false);
        }}
        initialValues={initialValues}
      />
    </>
  );
}

function ReviewField({ label, value, confidence }: { label: string; value: string; confidence: number }) {
  const requiresReview = confidence < 0.98;
  return (
    <div className={requiresReview ? "rounded-lg border border-amber-500/50 bg-amber-500/5 p-2" : "rounded-lg border p-2"}>
      <p className="text-[10px] font-semibold uppercase text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate font-medium">{value}</p>
      {requiresReview && <p className="mt-1 text-[10px] text-amber-700 dark:text-amber-400">Revisar · {Math.round(confidence * 100)}%</p>}
    </div>
  );
}
