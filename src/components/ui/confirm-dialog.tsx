import * as React from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { AlertTriangle, Trash2, ShieldAlert, Info } from "lucide-react";

type ConfirmVariant = "default" | "destructive" | "warning" | "info";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
  onConfirm: () => void;
  onCancel?: () => void;
}

const variantConfig: Record<ConfirmVariant, {
  icon: React.ReactNode;
  iconBg: string;
  confirmClass: string;
}> = {
  default: {
    icon: <Info className="w-6 h-6 text-primary" />,
    iconBg: "bg-primary/10",
    confirmClass: "bg-primary hover:bg-primary/90 text-primary-foreground",
  },
  destructive: {
    icon: <Trash2 className="w-6 h-6 text-destructive" />,
    iconBg: "bg-destructive/10",
    confirmClass: "bg-destructive hover:bg-destructive/90 text-destructive-foreground",
  },
  warning: {
    icon: <AlertTriangle className="w-6 h-6 text-yellow-500" />,
    iconBg: "bg-yellow-500/10",
    confirmClass: "bg-yellow-500 hover:bg-yellow-600 text-white",
  },
  info: {
    icon: <ShieldAlert className="w-6 h-6 text-blue-500" />,
    iconBg: "bg-blue-500/10",
    confirmClass: "bg-blue-500 hover:bg-blue-600 text-white",
  },
};

export const ConfirmDialog = ({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirmer",
  cancelLabel = "Annuler",
  variant = "default",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) => {
  const config = variantConfig[variant];

  const handleConfirm = () => {
    onConfirm();
    onOpenChange(false);
  };

  const handleCancel = () => {
    onCancel?.();
    onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md border border-border/60 shadow-2xl">
        <AlertDialogHeader>
          <div className="flex items-start gap-4">
            <div className={cn("p-3 rounded-full shrink-0", config.iconBg)}>
              {config.icon}
            </div>
            <div className="space-y-1 pt-0.5">
              <AlertDialogTitle className="text-lg font-semibold leading-tight">
                {title}
              </AlertDialogTitle>
              {description && (
                <AlertDialogDescription className="text-sm text-muted-foreground leading-relaxed">
                  {description}
                </AlertDialogDescription>
              )}
            </div>
          </div>
        </AlertDialogHeader>
        <AlertDialogFooter className="mt-2 gap-2 sm:gap-2">
          <AlertDialogCancel
            onClick={handleCancel}
            className="flex-1 sm:flex-none"
          >
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            className={cn("flex-1 sm:flex-none font-semibold", config.confirmClass)}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

// Hook utilitaire pour gérer l'état du dialog de confirmation
export const useConfirmDialog = () => {
  const [state, setState] = React.useState<{
    open: boolean;
    config: Omit<ConfirmDialogProps, "open" | "onOpenChange">;
  }>({
    open: false,
    config: { title: "", onConfirm: () => {} },
  });

  const confirm = (config: Omit<ConfirmDialogProps, "open" | "onOpenChange">) => {
    setState({ open: true, config });
  };

  const close = () => setState((s) => ({ ...s, open: false }));

  const dialog = (
    <ConfirmDialog
      open={state.open}
      onOpenChange={(v) => setState((s) => ({ ...s, open: v }))}
      {...state.config}
    />
  );

  return { confirm, close, dialog };
};
