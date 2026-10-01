import { FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";

export const SandboxBadge = ({ className }: { className?: string }) => (
  <span
    className={cn(
      "inline-flex items-center gap-1 rounded-full bg-purple-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-purple-700 ring-1 ring-purple-500/30 dark:text-purple-300",
      className,
    )}
    title="Proyecto de prueba — no cuenta en reportes financieros"
  >
    <FlaskConical className="h-3 w-3" /> Sandbox
  </span>
);
