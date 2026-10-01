import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Smartphone, Download, Apple, Chrome } from "lucide-react";

interface BIPEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const Install = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BIPEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BIPEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", () => setInstalled(true));
    if (window.matchMedia("(display-mode: standalone)").matches) setInstalled(true);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

  const install = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Smartphone className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Instalar app</h1>
      </div>

      {installed ? (
        <Card><CardContent className="p-4 text-sm">✅ La app ya está instalada en este dispositivo.</CardContent></Card>
      ) : (
        <>
          {deferredPrompt && (
            <Button onClick={install} className="h-12 w-full">
              <Download className="mr-2 h-5 w-5" /> Instalar Crew Hub
            </Button>
          )}

          <Card>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center gap-2 font-semibold">
                <Apple className="h-5 w-5" /> iPhone / iPad (Safari)
              </div>
              <ol className="ml-5 list-decimal space-y-1 text-sm text-muted-foreground">
                <li>Pulsa el botón <strong>Compartir</strong> (cuadro con flecha).</li>
                <li>Selecciona <strong>Añadir a pantalla de inicio</strong>.</li>
                <li>Confirma con <strong>Añadir</strong>.</li>
              </ol>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center gap-2 font-semibold">
                <Chrome className="h-5 w-5" /> Android (Chrome)
              </div>
              <ol className="ml-5 list-decimal space-y-1 text-sm text-muted-foreground">
                <li>Toca el menú <strong>⋮</strong> arriba a la derecha.</li>
                <li>Elige <strong>Instalar app</strong> o <strong>Añadir a pantalla principal</strong>.</li>
                <li>Confirma e inicia desde tu pantalla principal.</li>
              </ol>
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground">
            Una vez instalada, la app abre en pantalla completa, sin barra del navegador, como una app nativa.
          </p>
        </>
      )}
    </div>
  );
};

export default Install;
