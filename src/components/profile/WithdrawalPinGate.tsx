/**
 * Garde d'accès PIN retrait (`user_withdrawal_pins`). Création (set), validation (verify) ou reset (edge `withdrawal-pin-reset` + email Resend). Cache enfants tant que PIN non validé pour la session.
 */
import { useEffect, useState } from "react";
import * as withdrawals from "@/api/endpoints/withdrawals";
import { ApiError } from "@/api/http";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { Lock, ShieldCheck, KeyRound, Mail } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

interface Props {
  children: React.ReactNode;
}

/**
 * Wraps a sensitive section (withdrawal + payout methods) behind a 6-digit PIN.
 * - First-time use: prompts to create a PIN.
 * - Subsequent access: prompts the PIN. On success keeps unlocked for the session.
 * - "Code oublié ?" → email OTP flow.
 * Session is kept in sessionStorage and cleared on tab close.
 */
const SESSION_KEY = "withdrawal_pin_unlocked";

export const WithdrawalPinGate = ({ children }: Props) => {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [hasPin, setHasPin] = useState<boolean | null>(null);
  const [unlocked, setUnlocked] = useState<boolean>(() => sessionStorage.getItem(SESSION_KEY) === "1");
  const [pin, setPin] = useState("");
  const [creating, setCreating] = useState(false);
  const [createPin, setCreatePin] = useState("");
  const [createPin2, setCreatePin2] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Change PIN dialog
  const [changeOpen, setChangeOpen] = useState(false);
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [newPin2, setNewPin2] = useState("");

  // Reset PIN (forgot)
  const [resetOpen, setResetOpen] = useState(false);
  const [resetStep, setResetStep] = useState<"request" | "confirm">("request");
  const [resetOtp, setResetOtp] = useState("");
  const [resetNewPin, setResetNewPin] = useState("");
  const [resetSending, setResetSending] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await withdrawals.hasPin();
        setHasPin(!!r?.hasPin);
      } catch {
        setHasPin(false);
      }
    })();
  }, []);

  const handleCreatePin = async () => {
    if (createPin !== createPin2) {
      toast({ title: "Les codes ne correspondent pas", variant: "destructive" });
      return;
    }
    if (!/^\d{6}$/.test(createPin)) {
      toast({ title: "Le code doit contenir 6 chiffres", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      await withdrawals.setPin({ newPin: createPin });
    } catch (e) {
      setSubmitting(false);
      toast({ title: "Erreur", description: e instanceof ApiError ? e.message : undefined, variant: "destructive" });
      return;
    }
    setSubmitting(false);
    toast({ title: "Code créé", description: "Ton PIN de retrait est actif." });
    setHasPin(true);
    setUnlocked(true);
    sessionStorage.setItem(SESSION_KEY, "1");
  };

  const handleVerify = async () => {
    if (!/^\d{6}$/.test(pin)) {
      toast({ title: "Code invalide", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    let valid = false;
    try {
      const r = await withdrawals.verifyPin({ pin });
      valid = !!r?.valid;
    } catch {
      valid = false;
    }
    setSubmitting(false);
    if (!valid) {
      toast({ title: "Code refusé", variant: "destructive" });
      setPin("");
      return;
    }
    setUnlocked(true);
    sessionStorage.setItem(SESSION_KEY, "1");
  };

  const handleChange = async () => {
    if (newPin !== newPin2) {
      toast({ title: "Les nouveaux codes ne correspondent pas", variant: "destructive" });
      return;
    }
    try {
      await withdrawals.setPin({ newPin, currentPin });
    } catch (e) {
      toast({ title: "Erreur", description: e instanceof ApiError ? e.message : undefined, variant: "destructive" });
      return;
    }
    toast({ title: "Code mis à jour" });
    setChangeOpen(false);
    setCurrentPin(""); setNewPin(""); setNewPin2("");
  };

  const handleRequestReset = async () => {
    setResetSending(true);
    try {
      await withdrawals.requestPinReset();
    } catch (e) {
      setResetSending(false);
      toast({ title: "Erreur", description: e instanceof ApiError ? e.message : "Impossible d'envoyer le code", variant: "destructive" });
      return;
    }
    setResetSending(false);
    toast({ title: "Code envoyé", description: "Vérifie ta boîte mail." });
    setResetStep("confirm");
  };

  const handleConfirmReset = async () => {
    if (!/^\d{6}$/.test(resetOtp) || !/^\d{6}$/.test(resetNewPin)) {
      toast({ title: "Codes invalides", variant: "destructive" });
      return;
    }
    try {
      await withdrawals.confirmPinReset({ otp: resetOtp, newPin: resetNewPin });
    } catch (e) {
      toast({ title: "Erreur", description: e instanceof ApiError ? e.message : undefined, variant: "destructive" });
      return;
    }
    toast({ title: "PIN réinitialisé", description: "Tu peux maintenant te connecter avec ton nouveau code." });
    setResetOpen(false);
    setResetStep("request");
    setResetOtp(""); setResetNewPin("");
    setHasPin(true);
  };

  if (hasPin === null) {
    return <p className="text-sm text-muted-foreground text-center py-6">{t("pinLoading")}</p>;
  }

  if (unlocked) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-green-500/10 border border-green-500/30">
          <div className="flex items-center gap-2 text-xs text-green-700 dark:text-green-400">
            <ShieldCheck className="w-4 h-4" />
            {t("pinUnlockedBadge")}
          </div>
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={() => setChangeOpen(true)}>
              <KeyRound className="w-3 h-3 mr-1" />{t("pinChangeBtn")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { sessionStorage.removeItem(SESSION_KEY); setUnlocked(false); setPin(""); }}>
              <Lock className="w-3 h-3 mr-1" />{t("pinLockBtn")}
            </Button>
          </div>
        </div>
        {children}

        {/* Change PIN dialog */}
        <Dialog open={changeOpen} onOpenChange={setChangeOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>{t("pinChangeTitle")}</DialogTitle>
              <DialogDescription>{t("pinChangeDesc")}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-xs">{t("pinCurrentLabel")}</label>
                <InputOTP maxLength={6} value={currentPin} onChange={setCurrentPin}>
                  <InputOTPGroup>{[0,1,2,3,4,5].map(i => <InputOTPSlot key={i} index={i} />)}</InputOTPGroup>
                </InputOTP>
              </div>
              <div>
                <label className="text-xs">{t("pinNewLabel")}</label>
                <InputOTP maxLength={6} value={newPin} onChange={setNewPin}>
                  <InputOTPGroup>{[0,1,2,3,4,5].map(i => <InputOTPSlot key={i} index={i} />)}</InputOTPGroup>
                </InputOTP>
              </div>
              <div>
                <label className="text-xs">{t("pinConfirmLabel")}</label>
                <InputOTP maxLength={6} value={newPin2} onChange={setNewPin2}>
                  <InputOTPGroup>{[0,1,2,3,4,5].map(i => <InputOTPSlot key={i} index={i} />)}</InputOTPGroup>
                </InputOTP>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setChangeOpen(false)}>{t("pinCancel")}</Button>
              <Button onClick={handleChange}>{t("pinUpdate")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // Locked: either create or verify
  return (
    <Card className="max-w-md mx-auto border-primary/30">
      <CardHeader className="text-center">
        <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-2">
          <Lock className="w-6 h-6 text-primary" />
        </div>
        <CardTitle>{hasPin ? t("pinProtectedZone") : t("pinConfigureTitle")}</CardTitle>
        <CardDescription className="text-xs">
          {hasPin
            ? t("pinEnterDesc")
            : t("pinCreateDesc")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {hasPin ? (
          <>
            <div className="flex justify-center">
              <InputOTP maxLength={6} value={pin} onChange={setPin}>
                <InputOTPGroup>
                  {[0,1,2,3,4,5].map(i => <InputOTPSlot key={i} index={i} />)}
                </InputOTPGroup>
              </InputOTP>
            </div>
            <Button className="w-full" onClick={handleVerify} disabled={submitting || pin.length !== 6}>
              {t("pinUnlockBtn")}
            </Button>
            <div className="text-center">
              <Dialog open={resetOpen} onOpenChange={(o) => { setResetOpen(o); if (!o) { setResetStep("request"); setResetOtp(""); setResetNewPin(""); } }}>
                <DialogTrigger asChild>
                  <Button variant="link" size="sm" className="text-xs"><Mail className="w-3 h-3 mr-1" />{t("pinForgotBtn")}</Button>
                </DialogTrigger>
                <DialogContent className="max-w-sm">
                  <DialogHeader>
                    <DialogTitle>{t("pinResetTitle")}</DialogTitle>
                    <DialogDescription>
                      {resetStep === "request"
                        ? t("pinResetRequestDesc")
                        : t("pinResetConfirmDesc")}
                    </DialogDescription>
                  </DialogHeader>
                  {resetStep === "request" ? (
                    <div className="space-y-3">
                      <p className="text-sm text-muted-foreground">{t("pinResetInvalidates")}</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs">{t("pinOtpLabel")}</label>
                        <InputOTP maxLength={6} value={resetOtp} onChange={setResetOtp}>
                          <InputOTPGroup>{[0,1,2,3,4,5].map(i => <InputOTPSlot key={i} index={i} />)}</InputOTPGroup>
                        </InputOTP>
                      </div>
                      <div>
                        <label className="text-xs">{t("pinNewPinLabel")}</label>
                        <InputOTP maxLength={6} value={resetNewPin} onChange={setResetNewPin}>
                          <InputOTPGroup>{[0,1,2,3,4,5].map(i => <InputOTPSlot key={i} index={i} />)}</InputOTPGroup>
                        </InputOTP>
                      </div>
                    </div>
                  )}
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setResetOpen(false)}>{t("pinCancel")}</Button>
                    {resetStep === "request" ? (
                      <Button onClick={handleRequestReset} disabled={resetSending}>
                        {resetSending ? t("pinSending") : t("pinSendCode")}
                      </Button>
                    ) : (
                      <Button onClick={handleConfirmReset}>{t("pinResetBtn")}</Button>
                    )}
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </>
        ) : (
          <>
            <div>
              <label className="text-xs">{t("pinChooseLabel")}</label>
              <div className="flex justify-center mt-1">
                <InputOTP maxLength={6} value={createPin} onChange={setCreatePin}>
                  <InputOTPGroup>{[0,1,2,3,4,5].map(i => <InputOTPSlot key={i} index={i} />)}</InputOTPGroup>
                </InputOTP>
              </div>
            </div>
            <div>
              <label className="text-xs">{t("pinConfirmShort")}</label>
              <div className="flex justify-center mt-1">
                <InputOTP maxLength={6} value={createPin2} onChange={setCreatePin2}>
                  <InputOTPGroup>{[0,1,2,3,4,5].map(i => <InputOTPSlot key={i} index={i} />)}</InputOTPGroup>
                </InputOTP>
              </div>
            </div>
            <Button className="w-full" onClick={handleCreatePin} disabled={submitting || createPin.length !== 6 || createPin2.length !== 6}>
              {t("pinCreateBtn")}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default WithdrawalPinGate;
