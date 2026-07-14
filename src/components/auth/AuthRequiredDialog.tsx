/**
 * Dialog auth requise : popup styled bloquant pour visiteurs anonymes (Auth Gate). Redirect vers
 * `/auth` après confirmation.
 */
import { useNavigate } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { LogIn } from "lucide-react";
import logoImg from "@/assets/logo.png";

interface AuthRequiredDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const AuthRequiredDialog = ({ open, onOpenChange }: AuthRequiredDialogProps) => {
  const navigate = useNavigate();
  const { t } = useLanguage();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-card border-border">
        <DialogHeader className="text-center items-center">
          <div className="w-16 h-16 rounded-full bg-gradient-primary flex items-center justify-center mx-auto mb-3">
            <img src={logoImg} alt="Dual Music" className="w-8 h-8" />
          </div>
          <DialogTitle className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent">
            {t("authGateTitle")}
          </DialogTitle>
          <DialogDescription className="text-base text-muted-foreground pt-2">
            {t("authGateDesc")}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 pt-4">
          <Button
            onClick={() => { onOpenChange(false); navigate("/auth"); }}
            className="w-full h-12 text-base bg-gradient-primary hover:shadow-glow transition-all"
          >
            <LogIn className="w-5 h-5 mr-2" />
            {t("authGateCta")}
          </Button>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="text-muted-foreground"
          >
            {t("authGateContinue")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
