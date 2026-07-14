/**
 * Changement mot de passe via `authApi.changePassword`. Validation force + confirmation.
 */
import { useState } from "react";
import { Eye, EyeOff, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import * as authApi from "@/api/endpoints/auth";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";

export const PasswordChange = () => {
  const { t } = useLanguage();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      toast({ title: t("error"), description: t("profilePasswordMismatch"), variant: "destructive" });
      return;
    }

    if (newPassword.length < 6) {
      toast({ title: t("error"), description: t("profilePasswordTooShort"), variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      await authApi.changePassword(newPassword);
      toast({ title: t("profilePasswordChanged"), description: t("profilePasswordChangedDesc") });
      setNewPassword("");
      setConfirmPassword("");
    } catch (error: any) {
      toast({ title: t("error"), description: error.message || t("profilePasswordChangeError"), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lock className="w-5 h-5" />
          {t("profilePasswordTitle")}
        </CardTitle>
        <CardDescription>{t("profilePasswordDesc")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleChangePassword} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-password">{t("profilePasswordNew")}</Label>
            <div className="relative">
              <Input
                id="new-password"
                type={showPasswords ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-full"
                onClick={() => setShowPasswords(!showPasswords)}
              >
                {showPasswords ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">{t("profilePasswordConfirm")}</Label>
            <Input
              id="confirm-password"
              type={showPasswords ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={6}
            />
          </div>
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? t("profilePasswordChanging") : t("profilePasswordChangeBtn")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};