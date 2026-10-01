import { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  extra?: ReactNode;
}

/** Estado vacío reutilizable con CTA opcional. */
export const EmptyState = ({ icon: Icon, title, description, actionLabel, onAction, extra }: EmptyStateProps) => (
  <Card>
    <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
      {Icon && (
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Icon className="h-6 w-6 text-muted-foreground" />
        </div>
      )}
      <div className="space-y-1">
        <p className="text-base font-semibold">{title}</p>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actionLabel && onAction && (
        <Button onClick={onAction} className="h-11">
          {actionLabel}
        </Button>
      )}
      {extra}
    </CardContent>
  </Card>
);
