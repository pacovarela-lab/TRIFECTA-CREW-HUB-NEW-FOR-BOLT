import { cn } from "@/lib/utils";
import { type DerivedStatus, statusBadgeClass, statusLabel } from "@/lib/projectStatus";

export const ProjectStatusBadge = ({ status, className }: { status: DerivedStatus; className?: string }) => (
  <span
    className={cn(
      "pill",
      statusBadgeClass(status),
      className,
    )}
  >
    {statusLabel(status)}
  </span>
);
