import { WifiOff } from "lucide-react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

/** Banner sticky cuando el navegador detecta que estás offline. */
export const OfflineBanner = () => {
  const online = useOnlineStatus();
  if (online) return null;
  return (
    <div
      role="status"
      className="sticky top-0 z-50 flex items-center justify-center gap-2 bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground"
    >
      <WifiOff className="h-3.5 w-3.5" />
      Sin conexión — los cambios se intentarán cuando vuelva la señal.
    </div>
  );
};
