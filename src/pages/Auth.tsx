import { useState, useEffect } from "react";
import SEO from "@/components/seo/SEO";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Eye, EyeOff, Search, ArrowLeft, CheckCircle2, XCircle, Gift, Lock } from "lucide-react";
import logoImg from "@/assets/logo-tr.png";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import * as authApi from "@/api/endpoints/auth";
import * as usersApi from "@/api/endpoints/users";
import { ApiError } from "@/api/http";
import { useToast } from "@/hooks/use-toast";
import { COUNTRIES } from "@/data/countries";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import WelcomeOnboarding from "@/components/onboarding/WelcomeOnboarding";
import { useLanguage } from "@/contexts/LanguageContext";
import { useReferralEnabled } from "@/hooks/usePlatformConfig";

// Simple email regex validator
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const Auth = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { signIn, signUp, isAuthenticated, isAdmin, ready } = useAuth();
  const [searchParams] = useSearchParams();
  const refFromUrl = (searchParams.get("ref") || "").trim();

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupEmailTouched, setSignupEmailTouched] = useState(false);
  const [signupPhone, setSignupPhone] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupConfirmPassword, setSignupConfirmPassword] = useState("");
  const [signupReferralCode, setSignupReferralCode] = useState(refFromUrl);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [countryCode, setCountryCode] = useState("FR");
  const [loading, setLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [resetSent, setResetSent] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");
  const [countryOpen, setCountryOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingName, setOnboardingName] = useState("");

  // Inscription en 3 étapes : 1 = identifiants (email+mdp+confirmation),
  // 2 = code reçu par email, 3 = profil (nom, pays, numéro).
  const [signupStep, setSignupStep] = useState<1 | 2 | 3>(1);
  const [verifyCode, setVerifyCode] = useState("");
  // Vrai pendant tout le wizard : empêche la redirection auto (l'utilisateur est
  // authentifié dès l'étape 1 mais doit encore valider le code + compléter son profil).
  const [wizardActive, setWizardActive] = useState(false);

  const { data: referralEnabled = true, isLoading: referralEnabledLoading } = useReferralEnabled();
  const referralLocked = refFromUrl.length > 0 && referralEnabled;

  const isSignupEmailValid = EMAIL_REGEX.test(signupEmail);
  const showEmailError = signupEmailTouched && signupEmail.length > 0 && !isSignupEmailValid;
  const showEmailSuccess = signupEmailTouched && isSignupEmailValid;

  const selectedCountry = COUNTRIES.find((c) => c.code === countryCode) ?? COUNTRIES.find(c => c.code === "FR")!;

  const filteredCountries = COUNTRIES.filter((c) =>
    c.name.toLowerCase().includes(countrySearch.toLowerCase()) ||
    c.dial.includes(countrySearch)
  );

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await authApi.forgotPassword(forgotEmail);

      setResetSent(true);
      toast({
        title: t("resetEmailSent"),
        description: t("resetEmailSentDesc"),
      });
    } catch (error: any) {
      toast({
        title: "Erreur",
        description: error instanceof ApiError ? error.message : String(error?.message ?? error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Redirect an already-authenticated user away from the auth page, by role.
  // Suspendu pendant le wizard d'inscription (l'utilisateur est déjà authentifié dès
  // l'étape 1 mais doit valider le code puis compléter son profil avant la redirection).
  useEffect(() => {
    if (ready && isAuthenticated && !wizardActive) {
      navigate(isAdmin ? "/admin" : "/profile");
    }
  }, [ready, isAuthenticated, isAdmin, navigate, wizardActive]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await signIn(loginEmail, loginPassword);

      toast({
        title: t("loginSuccess"),
        description: t("loginWelcome"),
      });
      // Navigation is handled by the auth redirect effect once state settles.
    } catch (error: any) {
      toast({
        title: t("loginError"),
        description: error instanceof ApiError ? error.message : String(error?.message ?? error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Password strength calculator
  const getPasswordStrength = (password: string): { level: "weak" | "medium" | "strong"; score: number } => {
    let score = 0;
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    if (score <= 1) return { level: "weak", score };
    if (score <= 3) return { level: "medium", score };
    return { level: "strong", score };
  };

  const passwordStrength = getPasswordStrength(signupPassword);
  const strengthColors = {
    weak: "bg-destructive",
    medium: "bg-yellow-500",
    strong: "bg-green-500",
  };
  const strengthWidths = { weak: "w-1/3", medium: "w-2/3", strong: "w-full" };
  const strengthLabels = { weak: t("passwordWeak"), medium: t("passwordMedium"), strong: t("passwordStrong") };

  // Étape 1 — crée le compte avec email + mot de passe (+ code parrainage éventuel de l'URL).
  // Le backend envoie automatiquement le code de vérification par email → on passe à l'étape 2.
  const handleSignupStep1 = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isSignupEmailValid) {
      setSignupEmailTouched(true);
      toast({ title: t("invalidEmail"), description: t("invalidEmailDesc"), variant: "destructive" });
      return;
    }
    if (signupPassword !== signupConfirmPassword) {
      toast({ title: t("error"), description: t("passwordsMismatchToast"), variant: "destructive" });
      return;
    }

    setLoading(true);
    setWizardActive(true); // Empêche la redirection auto pendant les étapes suivantes.
    try {
      const user = await signUp({
        email: signupEmail,
        password: signupPassword,
        referralCode: referralEnabled ? signupReferralCode.trim() || null : null,
      });
      if (user) setSignupStep(2);
    } catch (error: any) {
      setWizardActive(false);
      toast({
        title: t("signupError"),
        description: error instanceof ApiError ? error.message : String(error?.message ?? error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Étape 2 — vérifie le code reçu par email, puis passe à la saisie du profil.
  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (verifyCode.trim().length < 4) return;
    setLoading(true);
    try {
      await authApi.verifyEmailOtp(verifyCode.trim());
      setSignupStep(3);
    } catch (error: any) {
      toast({
        title: t("error"),
        description: error instanceof ApiError ? error.message : String(error?.message ?? error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // (Ré)envoie le code de vérification par email.
  const handleResendCode = async () => {
    try {
      await authApi.sendEmailOtp();
      toast({ title: t("resetEmailSent") ?? "Code envoyé", description: "Un nouveau code a été envoyé par email." });
    } catch (error: any) {
      toast({
        title: t("error"),
        description: error instanceof ApiError ? error.message : String(error?.message ?? error),
        variant: "destructive",
      });
    }
  };

  // Étape 3 — enregistre le profil (nom, pays, numéro) puis entre dans l'app.
  const handleCompleteProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signupName.trim()) return;
    setLoading(true);
    try {
      await usersApi.updateMe({
        full_name: signupName.trim(),
        country_code: countryCode,
        phone: signupPhone.trim() || null,
        phone_country_code: selectedCountry.dial,
      });
      setWizardActive(false); // Autorise de nouveau la redirection.
      setOnboardingName(signupName);
      setShowOnboarding(true);
    } catch (error: any) {
      toast({
        title: t("error"),
        description: error instanceof ApiError ? error.message : String(error?.message ?? error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Passe l'étape profil (l'utilisateur pourra la compléter plus tard).
  const handleSkipProfile = () => {
    setWizardActive(false);
    navigate(isAdmin ? "/admin" : "/profile");
  };

  if (showOnboarding) {
    return <WelcomeOnboarding userName={onboardingName} />;
  }

  return (
    <>
      <SEO title="Connexion / Inscription — Dual Music" description="Créez votre compte Dual Music ou connectez-vous pour voter, suivre des artistes et offrir des cadeaux." path="/auth" />
    <div className="min-h-screen flex items-center justify-center bg-gradient-hero p-4">
      <Card className="w-full max-w-md p-8 bg-card/50 backdrop-blur-lg border-border/50 shadow-elegant animate-fade-in">
        {/* Back to home */}
        <div className="mb-4">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            {t("backToHome")}
          </Link>
        </div>

        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center justify-center mb-4">
            <img src={logoImg} alt="Dual Music" className="h-20 w-auto" />
          </Link>
          <p className="text-muted-foreground">
            {t("joinCommunity")}
          </p>
        </div>

        {!showForgotPassword && (
        <Tabs defaultValue={referralLocked ? "signup" : "login"} className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="login">{t("loginTab")}</TabsTrigger>
            <TabsTrigger value="signup">{t("signupTab")}</TabsTrigger>
          </TabsList>

          <TabsContent value="login">
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">{t("email")}</Label>
                <Input
                  id="email"
                  type="email"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="votremail@exemple.com"
                  className="bg-background/50"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">{t("password")}</Label>
                <Input
                  id="password"
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="••••••••"
                  className="bg-background/50"
                  required
                />
              </div>
              <Button
                type="submit"
                className="w-full bg-gradient-primary hover:shadow-glow transition-all"
                disabled={loading}
              >
                {loading ? t("loggingIn") : t("loginAction")}
              </Button>
              <Button
                type="button"
                variant="link"
                className="w-full text-sm"
                onClick={() => setShowForgotPassword(true)}
              >
                {t("forgotPassword")}
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="signup">
            {/* Étape 1 — identifiants uniquement (email + mot de passe + confirmation). */}
            {signupStep === 1 && (
            <form onSubmit={handleSignupStep1} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="signup-email">{t("email")}</Label>
                <div className="relative">
                  <Input
                    id="signup-email"
                    type="email"
                    value={signupEmail}
                    onChange={(e) => {
                      setSignupEmail(e.target.value);
                      if (!signupEmailTouched) setSignupEmailTouched(true);
                    }}
                    onBlur={() => setSignupEmailTouched(true)}
                    placeholder="votremail@exemple.com"
                    className={`bg-background/50 pr-10 ${
                      showEmailError
                        ? "border-destructive focus-visible:ring-destructive"
                        : showEmailSuccess
                        ? "border-green-500 focus-visible:ring-green-500"
                        : ""
                    }`}
                    required
                  />
                  {showEmailSuccess && (
                    <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-green-500 pointer-events-none" />
                  )}
                  {showEmailError && (
                    <XCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-destructive pointer-events-none" />
                  )}
                </div>
                {showEmailError && (
                   <p className="text-xs text-destructive">
                    {t("invalidEmailHint")}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="signup-password">{t("password")}</Label>
                <div className="relative">
                  <Input
                    id="signup-password"
                    type={showPassword ? "text" : "password"}
                    value={signupPassword}
                    onChange={(e) => setSignupPassword(e.target.value)}
                    placeholder="••••••••"
                    className="bg-background/50 pr-10"
                    required
                    minLength={6}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                </div>
                {signupPassword.length > 0 && (
                  <div className="space-y-1">
                    <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${strengthColors[passwordStrength.level]} ${strengthWidths[passwordStrength.level]}`}
                      />
                    </div>
                    <p className={`text-xs font-medium ${
                      passwordStrength.level === "weak" ? "text-destructive" :
                      passwordStrength.level === "medium" ? "text-yellow-500" : "text-green-500"
                    }`}>
                      {t("passwordStrength")} : {strengthLabels[passwordStrength.level]}
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="signup-confirm-password">{t("confirmPassword")}</Label>
                <div className="relative">
                  <Input
                    id="signup-confirm-password"
                    type={showConfirmPassword ? "text" : "password"}
                    value={signupConfirmPassword}
                    onChange={(e) => setSignupConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className={`bg-background/50 pr-10 ${
                      signupConfirmPassword.length > 0 && signupConfirmPassword !== signupPassword
                        ? "border-destructive focus-visible:ring-destructive"
                        : ""
                    }`}
                    required
                    minLength={6}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                </div>
                {signupConfirmPassword.length > 0 && signupConfirmPassword !== signupPassword && (
                  <p className="text-xs text-destructive">{t("passwordsMismatch")}</p>
                )}
              </div>

              {/* Acceptation obligatoire des documents légaux (cliquables) */}
              <div className="flex items-start gap-2">
                <Checkbox
                  id="accept-terms"
                  checked={acceptedTerms}
                  onCheckedChange={(v) => setAcceptedTerms(v === true)}
                  className="mt-0.5"
                />
                <Label htmlFor="accept-terms" className="text-sm text-muted-foreground font-normal leading-snug">
                  {t("iAcceptThe")}{" "}
                  <Link to="/terms" target="_blank" className="text-primary hover:underline">
                    {t("termsTitle")}
                  </Link>{" "}·{" "}
                  <Link to="/privacy" target="_blank" className="text-primary hover:underline">
                    {t("privacyTitle")}
                  </Link>
                </Label>
              </div>

              <Button
                type="submit"
                className="w-full bg-gradient-primary hover:shadow-glow transition-all"
                disabled={loading || !isSignupEmailValid || signupPassword.length < 6 || signupPassword !== signupConfirmPassword || !acceptedTerms}
              >
                {loading ? t("creatingAccount") : "Continuer"}
              </Button>
            </form>
            )}

            {/* Étape 2 — code de vérification reçu par email. */}
            {signupStep === 2 && (
            <form onSubmit={handleVerifyCode} className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Un code de vérification a été envoyé à <span className="font-medium text-foreground">{signupEmail}</span>. Saisis-le ci-dessous.
              </p>
              <div className="space-y-2">
                <Label htmlFor="verify-code">Code de vérification</Label>
                {/* Une case par chiffre (parité PIN retrait). */}
                <InputOTP maxLength={6} value={verifyCode} onChange={(v) => setVerifyCode(v.replace(/\D/g, ""))}>
                  <InputOTPGroup className="mx-auto">
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                    <InputOTPSlot index={3} />
                    <InputOTPSlot index={4} />
                    <InputOTPSlot index={5} />
                  </InputOTPGroup>
                </InputOTP>
              </div>
              <Button
                type="submit"
                className="w-full bg-gradient-primary hover:shadow-glow transition-all"
                disabled={loading || verifyCode.trim().length < 4}
              >
                {loading ? "Vérification…" : "Vérifier"}
              </Button>
              <Button type="button" variant="link" className="w-full text-sm" onClick={handleResendCode}>
                Renvoyer le code
              </Button>
            </form>
            )}

            {/* Étape 3 — profil : nom, pays, numéro. */}
            {signupStep === 3 && (
            <form onSubmit={handleCompleteProfile} className="space-y-4">
              <p className="text-sm text-muted-foreground">Email vérifié ✅. Complète ton profil pour finaliser.</p>
              <div className="space-y-2">
                <Label htmlFor="signup-name">{t("fullName")}</Label>
                <Input
                  id="signup-name"
                  value={signupName}
                  onChange={(e) => setSignupName(e.target.value)}
                  placeholder="John Doe"
                  className="bg-background/50"
                  required
                />
              </div>

              {/* Country + Phone */}
              <div className="space-y-2">
                <Label>{t("phoneOptional")}</Label>
                <div className="flex gap-2">
                  {/* Country selector with search */}
                  <Popover open={countryOpen} onOpenChange={setCountryOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className="w-36 shrink-0 bg-background/50 justify-start text-left font-normal text-sm px-3"
                      >
                        <span className="truncate">{selectedCountry.dial} {selectedCountry.code}</span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-72 p-0 bg-card border-border" align="start">
                      <div className="p-2 border-b border-border">
                        <div className="relative">
                           <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <input
                            type="text"
                            placeholder={t("searchCountry")}
                            value={countrySearch}
                            onChange={(e) => setCountrySearch(e.target.value)}
                            className="w-full pl-8 pr-3 py-1.5 text-sm bg-background/50 border border-border rounded-md outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground"
                            autoFocus
                          />
                        </div>
                      </div>
                      <div className="max-h-48 overflow-y-auto">
                        {filteredCountries.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-4">{t("noResults")}</p>
                        ) : (
                          filteredCountries.map((country) => (
                            <button
                              key={country.code}
                              type="button"
                              onClick={() => {
                                setCountryCode(country.code);
                                setCountrySearch("");
                                setCountryOpen(false);
                              }}
                              className={`w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-muted/50 transition-colors text-left ${
                                countryCode === country.code ? "bg-primary/10 text-primary font-medium" : "text-foreground"
                              }`}
                            >
                              <span>{country.name}</span>
                              <span className="text-muted-foreground ml-2 shrink-0">{country.dial}</span>
                            </button>
                          ))
                        )}
                      </div>
                    </PopoverContent>
                  </Popover>
                  <Input
                    id="signup-phone"
                    type="tel"
                    value={signupPhone}
                    onChange={(e) => setSignupPhone(e.target.value)}
                    placeholder="612345678"
                    className="bg-background/50 flex-1"
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full bg-gradient-primary hover:shadow-glow transition-all"
                disabled={loading || !signupName.trim()}
              >
                {loading ? "Enregistrement…" : "Terminer"}
              </Button>
              <Button type="button" variant="link" className="w-full text-sm" onClick={handleSkipProfile}>
                Plus tard
              </Button>
            </form>
            )}
          </TabsContent>
        </Tabs>
        )}

        {showForgotPassword && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">{t("resetPassword")}</h3>
            {resetSent ? (
              <div className="text-center space-y-4">
                <p className="text-muted-foreground">
                  {t("resetEmailSentInfo")} {forgotEmail}
                </p>
                <Button onClick={() => { setShowForgotPassword(false); setResetSent(false); }}>
                  {t("backToLogin")}
                </Button>
              </div>
            ) : (
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="forgot-email">{t("email")}</Label>
                  <Input
                    id="forgot-email"
                    type="email"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder="votremail@exemple.com"
                    className="bg-background/50"
                    required
                  />
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => setShowForgotPassword(false)}>
                    ← {t("backToLogin")}
                  </Button>
                  <Button type="submit" disabled={loading} className="flex-1">
                    {loading ? t("sending") : t("sendResetLink")}
                  </Button>
                </div>
              </form>
            )}
          </div>
        )}
      </Card>
    </div>
    </>
  );
};

export default Auth;
