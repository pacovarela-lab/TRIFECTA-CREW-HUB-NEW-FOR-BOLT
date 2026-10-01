import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Camera, DollarSign, FolderKanban, HardHat, Images, ListChecks, Mic, Receipt } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { QuickReceiptCapture } from "@/components/finance/QuickReceiptCapture";
import { ExpenseSheet } from "@/components/finance/ExpenseSheet";
import { PaymentSheet } from "@/components/finance/PaymentSheet";
import { VoiceExpenseSheet } from "@/components/finance/VoiceExpenseSheet";
import { TaskCreateSheet } from "@/components/tasks/TaskCreateSheet";
import { CheckinSheet } from "@/components/checkins/CheckinSheet";
import { useProjects } from "@/hooks/useTrifectaData";

type QuickActionsSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  receiptCaptureTrigger?: React.MutableRefObject<(() => void) | null>;
  receiptButtonClassName?: string;
  defaultProjectId?: string | null;
};

export function QuickActionsSheet({
  open,
  onOpenChange,
  receiptCaptureTrigger,
  receiptButtonClassName,
  defaultProjectId,
}: QuickActionsSheetProps) {
  const navigate = useNavigate();
  const { data: projects } = useProjects();
  const [captureRequest, setCaptureRequest] = useState(0);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [checkinOpen, setCheckinOpen] = useState(false);
  const internalTrigger = useRef<(() => void) | null>(null);
  const trigger = receiptCaptureTrigger ?? internalTrigger;

  const projectObject = defaultProjectId
    ? (projects ?? []).find((p: any) => p.id === defaultProjectId) ?? null
    : null;

  const openAction = (action: () => void) => {
    onOpenChange(false);
    window.setTimeout(action, 120);
  };

  const handleReceipt = () => {
    if (trigger.current) {
      trigger.current();
      onOpenChange(false);
    } else {
      openAction(() => setCaptureRequest((v) => v + 1));
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="max-h-[88dvh] overflow-y-auto rounded-t-3xl pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          <SheetHeader className="text-left">
            <SheetTitle>¿Qué deseas registrar?</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-3">
            <ActionRow icon={Camera} title="Tomar recibo" onClick={handleReceipt} primary />
            <ActionRow icon={DollarSign} title="Registrar cobro" onClick={() => openAction(() => setPaymentOpen(true))} />
            <ActionRow icon={HardHat} title="Pago a ayudante" onClick={() => openAction(() => setCheckinOpen(true))} />
            <ActionRow icon={Receipt} title="Agregar gasto" onClick={() => openAction(() => setExpenseOpen(true))} />
            <ActionRow icon={FolderKanban} title="Crear proyecto" onClick={() => openAction(() => navigate("/projects?new=1"))} />
            <ActionRow icon={ListChecks} title="Agregar tarea" onClick={() => openAction(() => setTaskOpen(true))} />
            <ActionRow icon={Images} title="Foto de presupuesto" onClick={() => openAction(() => navigate("/estimate-photo"))} />
            <ActionRow icon={Mic} title="Dictar gasto" onClick={() => openAction(() => setVoiceOpen(true))} />
          </div>
        </SheetContent>
      </Sheet>

      <QuickReceiptCapture
        captureRequest={captureRequest}
        captureTriggerRef={trigger}
        showButton={!!receiptButtonClassName}
        buttonClassName={receiptButtonClassName}
        projectId={defaultProjectId ?? null}
      />
      <ExpenseSheet open={expenseOpen} onOpenChange={setExpenseOpen} defaultProjectId={defaultProjectId ?? undefined} />
      <PaymentSheet open={paymentOpen} onOpenChange={setPaymentOpen} defaultProjectId={defaultProjectId ?? undefined} />
      <VoiceExpenseSheet open={voiceOpen} onOpenChange={setVoiceOpen} />
      <TaskCreateSheet open={taskOpen} onOpenChange={setTaskOpen} project={projectObject ?? undefined} />
      <CheckinSheet open={checkinOpen} onOpenChange={setCheckinOpen} defaultProjectId={defaultProjectId ?? null} />
    </>
  );
}

type ActionRowProps = {
  icon: typeof Camera;
  title: string;
  onClick: () => void;
  primary?: boolean;
};

const ActionRow = ({ icon: Icon, title, onClick, primary }: ActionRowProps) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      "flex min-h-[64px] w-full items-center gap-4 rounded-xl border p-4 text-left transition active:scale-[0.99]",
      primary
        ? "border-success bg-success text-success-foreground"
        : "border-border bg-card text-foreground hover:bg-accent",
    )}
  >
    <Icon className="h-7 w-7 shrink-0" />
    <span className="text-lg font-bold">{title}</span>
  </button>
);
