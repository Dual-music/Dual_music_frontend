/**
 * Page: Profile (/profile)
 *
 * Tableau de bord personnel multi-rôles. Le rendu s'adapte au rôle de
 * l'utilisateur (`ProfileRole`) : Fan, Artiste, Manager, Modérateur, Admin.
 * Chaque rôle dispose de son propre `Sidebar` (couleurs, onglets) et de
 * sections dédiées.
 *
 * Sections principales :
 *   - Tous rôles : avatar, infos perso, préférences (langue, notifs, devise),
 *     wallet unifié (Stripe/CinetPay/Moneroo), historique transactions,
 *     badges donateurs, suivi des artistes, dédicaces reçues/envoyées.
 *   - Artiste : validation, gestion concerts/lives, demandes de duel,
 *     upload lifestyle, retraits (`WithdrawalForm`), revenus.
 *   - Manager : profil public éditable, validation admin, duels assignés.
 *   - Admin : redirection sidebar admin + stats profil.
 *
 * Sécurité : retrait protégé par PIN (`WithdrawalPinGate`), réinitialisation
 * par email signé (`withdrawal-pin-reset`).
 *
 * @route   /profile
 * @access  authenticated
 * @see     src/components/profile/ProfileSidebar.tsx
 * @see     src/components/artist/WithdrawalForm.tsx
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getBalance } from "@/api/endpoints/wallet";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { Music2, LogOut, Wallet, Video, Award, Users, Gift, Trophy, Play, Upload, TrendingUp, Ticket, Calendar, Eye, Settings, Mic, Star, Crown, Briefcase, DollarSign, FileText, UserCheck, Camera, Lock, Bell, BookOpen } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import ProfileHeader from "@/components/profile/ProfileHeader";
import ProfileFooter from "@/components/profile/ProfileFooter";
import ProfileSidebar, { ProfileRole } from "@/components/profile/ProfileSidebar";
import AdminSidebar from "@/components/admin/AdminSidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { UserBadges } from "@/components/profile/UserBadges";
import { CountryBadge } from "@/components/profile/CountryBadge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LifestyleVideoUpload } from "@/components/artist/LifestyleVideoUpload";
import { ArtistValidationForm } from "@/components/artist/ArtistValidationForm";
import { ArtistPublicProfile } from "@/components/artist/ArtistPublicProfile";
import { DuelRequestForm } from "@/components/artist/DuelRequestForm";
import { WithdrawalForm } from "@/components/artist/WithdrawalForm";
import { ArtistConcertManager } from "@/components/artist/ArtistConcertManager";
import { ArtistDedicationsManager } from "@/components/artist/ArtistDedicationsManager";
import { ArtistLivesManager } from "@/components/artist/ArtistLivesManager";
import { MyCompetitions } from "@/components/competition/MyCompetitions";
import { ManagerCompetitionsPanel } from "@/components/competition/ManagerCompetitionsPanel";
import { ManagerValidationForm } from "@/components/manager/ManagerValidationForm";
import { FanSubscription } from "@/components/fan/FanSubscription";
import { AvatarUpload } from "@/components/profile/AvatarUpload";
import { PasswordChange } from "@/components/profile/PasswordChange";
import { FollowedArtists } from "@/components/profile/FollowedArtists";
import { AdminProfileStats } from "@/components/profile/AdminProfileStats";
import { ManagerPublicProfileEditor } from "@/components/manager/ManagerPublicProfileEditor";
import { RequestTracker } from "@/components/profile/RequestTracker";
import { EmailNotificationPreferences } from "@/components/profile/EmailNotificationPreferences";
import { VisualNotificationPreferences } from "@/components/profile/VisualNotificationPreferences";
import ReferralSection from "@/components/referral/ReferralSection";
import SponsorRequestSection from "@/components/sponsor/SponsorRequestSection";
import { CurrencySelector } from "@/components/profile/CurrencySelector";
import PreferencesPanel from "@/components/profile/PreferencesPanel";
import TransactionsPanel from "@/components/profile/TransactionsPanel";
import MyVotesHistory from "@/components/profile/MyVotesHistory";
import FanDedications from "@/components/profile/FanDedications";
import RewardMeetingCard from "@/components/profile/RewardMeetingCard";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import * as users from "@/api/endpoints/users";
import { useTransactionNotifications } from "@/hooks/useTransactionNotifications";
import { useUiPreferences } from "@/hooks/useUiPreferences";
import { formatTz } from "@/lib/datetime";

interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  country_code: string | null;
}

interface ArtistStats {
  totalVotes: number;
  totalGifts: number;
  totalDuels: number;
  wonDuels: number;
}

interface ManagerStats {
  totalDuelsManaged: number;
  activeDuels: number;
  totalGiftsReceived: number;
}

interface FanStats {
  totalVotesCast: number;
  totalGiftsSent: number;
  totalTickets: number;
}

interface Duel {
  id: string;
  status: string;
  scheduled_time: string | null;
  artist1_name?: string;
  artist2_name?: string;
}

const Profile = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { signOut, user, profile: authProfile, roles: authRoles, ready, refreshMe } = useAuth();
  const { t, language } = useLanguage();
  const { prefs } = useUiPreferences();
  const tz = prefs.timezone;
  const fmtDateTime = (d: string) => formatTz(d, "dd MMM yyyy HH:mm", { timezone: tz, language });
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [wallet, setWallet] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [fullName, setFullName] = useState("");
  const [bio, setBio] = useState("");
  const [artistStats, setArtistStats] = useState<ArtistStats>({ totalVotes: 0, totalGifts: 0, totalDuels: 0, wonDuels: 0 });
  const [managerStats, setManagerStats] = useState<ManagerStats>({ totalDuelsManaged: 0, activeDuels: 0, totalGiftsReceived: 0 });
  const [fanStats, setFanStats] = useState<FanStats>({ totalVotesCast: 0, totalGiftsSent: 0, totalTickets: 0 });
  const [myDuels, setMyDuels] = useState<Duel[]>([]);
  const [managedDuels, setManagedDuels] = useState<Duel[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Realtime toasts when a transaction is confirmed (purchase, gift, withdrawal)
  useTransactionNotifications(profile?.id ?? null);

  // Redirect unauthenticated users once the session has settled.
  useEffect(() => {
    if (ready && !user) navigate("/auth");
  }, [ready, user, navigate]);

  // Hydrate profile + roles from the auth session.
  useEffect(() => {
    if (authProfile) {
      setProfile(authProfile as any);
      setFullName((authProfile as any).full_name || "");
      setBio((authProfile as any).bio || "");
    }
    setRoles(authRoles as string[]);
  }, [authProfile, authRoles]);

  // Fetch wallet balance + consolidated stats (artist/manager/fan) via REST.
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const walletData = await getBalance();
        setWallet(walletData.balance || 0);
      } catch { /* best-effort */ }
      try {
        const s = await users.myStats();
        setArtistStats(s.artistStats as any);
        setManagerStats(s.managerStats as any);
        setFanStats(s.fanStats as any);
        setMyDuels(s.myDuels as any);
        setManagedDuels(s.managedDuels as any);
      } catch { /* best-effort */ }
      setLoading(false);
    })();
  }, [user]);

  const handleUpdateProfile = async () => {
    if (!profile) return;

    try {
      await users.updateMe({ full_name: fullName, bio });

      toast({
        title: t("profileUpdated"),
        description: t("profileSaved"),
      });
      
      setEditMode(false);
      void refreshMe();
    } catch (error: any) {
      toast({
        title: "Erreur",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleLogout = async () => {
    await signOut();
    navigate("/");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <ProfileHeader />
        <main className="flex-1 container mx-auto px-3 sm:px-4 pt-20 pb-8">
          <div className="flex gap-6">
            <div className="hidden lg:block w-60 shrink-0">
              <Skeleton className="h-[calc(100vh-6rem)] rounded-xl" />
            </div>
            <div className="flex-1 space-y-4">
              <Skeleton className="h-40 rounded-xl" />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Skeleton className="h-24 rounded-xl" />
                <Skeleton className="h-24 rounded-xl" />
                <Skeleton className="h-24 rounded-xl" />
                <Skeleton className="h-24 rounded-xl" />
              </div>
              <Skeleton className="h-64 rounded-xl" />
            </div>
          </div>
        </main>
        <ProfileFooter />
      </div>
    );
  }

  const isAdmin = roles.includes("admin");
  const isArtist = roles.includes("artist");
  const isManager = roles.includes("manager");
  const isFan = roles.includes("fan") && !isArtist && !isManager;

  // Determine primary role for styling
  const primaryRole = isAdmin ? "admin" : isArtist ? "artist" : isManager ? "manager" : "fan";

  const getRoleIcon = () => {
    switch (primaryRole) {
      case "admin": return <Crown className="w-6 h-6" />;
      case "artist": return <Mic className="w-6 h-6" />;
      case "manager": return <Briefcase className="w-6 h-6" />;
      default: return <Star className="w-6 h-6" />;
    }
  };

  const getRoleGradient = () => {
    switch (primaryRole) {
      case "admin": return "from-red-500 to-orange-500";
      case "artist": return "from-purple-500 to-pink-500";
      case "manager": return "from-blue-500 to-cyan-500";
      default: return "from-green-500 to-emerald-500";
    }
  };

  const getRoleTitle = () => {
    switch (primaryRole) {
      case "admin": return t("administration");
      case "artist": return t("artistDefault");
      case "manager": return t("profileManagerRole");
      default: return t("profileFanRole");
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "live":
        return <Badge className="bg-red-500 text-white animate-pulse">{t("live")}</Badge>;
      case "upcoming":
        return <Badge variant="outline" className="border-blue-500 text-blue-500">{t("upcoming")}</Badge>;
      case "completed":
        return <Badge variant="secondary">{t("ended")}</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const sidebarRole: ProfileRole = isArtist ? "artist" : isManager ? "manager" : "fan";

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <ProfileHeader primaryRole={primaryRole as any} showMenuButton onMenuToggle={() => setSidebarOpen((v) => !v)} />

      <main className="flex-1 container mx-auto px-3 sm:px-4 pt-20 pb-8">
        <div className="flex gap-6">
          {isAdmin ? (
            <AdminSidebar
              active="profile"
              onSelect={(v) => {
                if (v === "profile") return;
                if (v === "transactions") { navigate("/transactions"); return; }
                navigate(`/admin?tab=${v}`);
              }}
              stats={{
                pendingArtistRequests: 0,
                pendingManagerRequests: 0,
                pendingDuelRequests: 0,
                pendingWithdrawals: 0,
                activeLives: 0,
              }}
              open={sidebarOpen}
              onOpenChange={setSidebarOpen}
            />
          ) : (
            <ProfileSidebar
              role={sidebarRole}
              active={activeTab}
              onSelect={(v) => {
                if (v === "transactions") { navigate("/transactions"); return; }
                
                setActiveTab(v);
              }}
              open={sidebarOpen}
              onOpenChange={setSidebarOpen}
              title={getRoleTitle()}
            />
          )}
          <div className="flex-1 min-w-0 max-w-5xl space-y-6">
          
          {/* Hero Card avec couleur selon le rôle - visible selon le contexte */}
          {(((isArtist || isManager) && activeTab === "profile") || (isFan && activeTab === "dashboard") || isAdmin) && (
          <Card className={`relative overflow-hidden border-0`}>
            <div className={`absolute inset-0 bg-gradient-to-r ${getRoleGradient()} opacity-10`} />
            <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${getRoleGradient()}`} />
            
            <div className="relative p-6 md:p-8">
              <div className="flex flex-col md:flex-row items-start gap-6">
                <div className="relative">
                  <AvatarUpload 
                    userId={profile?.id || ""} 
                    currentAvatarUrl={profile?.avatar_url} 
                    fallbackText={fullName?.charAt(0) || "U"}
                    onAvatarUpdated={(url) => setProfile(prev => prev ? {...prev, avatar_url: url} : null)}
                  />
                  <div className={`absolute -bottom-2 -right-2 p-2 rounded-full bg-gradient-to-r ${getRoleGradient()} text-white shadow-lg`}>
                    {getRoleIcon()}
                  </div>
                </div>
                
                <div className="flex-1 space-y-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h1 className="text-3xl font-bold">{fullName || t("user")}</h1>
                    <Badge className={`bg-gradient-to-r ${getRoleGradient()} text-white border-0 text-sm px-3 py-1`}>
                      {getRoleTitle()}
                    </Badge>
                  </div>
                  
                  <p className="text-muted-foreground">{profile?.email}</p>

                  {profile?.country_code && (
                    <div className="flex flex-wrap items-center gap-2">
                      <CountryBadge countryCode={profile.country_code} />
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-3 pt-2">
                    <div className="flex items-center gap-2 bg-accent/50 px-4 h-10 rounded-md border border-border/50">
                      <Wallet className="w-5 h-5 text-primary" />
                      <span className="font-bold">{wallet}</span>
                      <span className="text-xs text-muted-foreground">{t("creditsLabel")}</span>
                    </div>
                    {bio && (
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="default" className="gap-2 h-10">
                            <BookOpen className="w-4 h-4" />
                            {t("biography") || "Biographie"}
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>{t("biography") || "Biographie"}</DialogTitle>
                          </DialogHeader>
                          <p className="text-sm text-muted-foreground whitespace-pre-wrap italic">"{bio}"</p>
                        </DialogContent>
                      </Dialog>
                    )}
                  </div>

                  {/* User Badges */}
                  {profile?.id && <UserBadges userId={profile.id} />}
                </div>

                <div className="flex flex-col gap-2">
                  <Button variant="outline" onClick={() => setEditMode(!editMode)} size="sm">
                    <Settings className="w-4 h-4 mr-2" />
                    {editMode ? t("cancel") : t("edit")}
                  </Button>
                </div>
              </div>

              {/* Edit Mode */}
              {editMode && (
                <div className="mt-6 pt-6 border-t border-border space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="fullName">{t("fullName")}</Label>
                      <Input
                        id="fullName"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="bio">{t("biography")}</Label>
                      <Input
                        id="bio"
                        value={bio}
                        onChange={(e) => setBio(e.target.value)}
                        placeholder={t("shortDescription")}
                      />
                    </div>
                  </div>
                  <Button onClick={handleUpdateProfile} className={`bg-gradient-to-r ${getRoleGradient()} text-white border-0`}>
                    {t("saveBtn")}
                  </Button>
                  
                  <div className="mt-6 pt-6 border-t border-border">
                    <PasswordChange />
                  </div>
                </div>
              )}
            </div>
          </Card>
          )}

          {/* Actions rapides universelles */}
          <Card className="p-4">
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => navigate("/wallet")} className={`bg-gradient-to-r ${getRoleGradient()} text-white border-0`}>
                <Wallet className="w-4 h-4 mr-2" />
                {t("rechargeWalletBtn")}
              </Button>
              <Button variant="outline" onClick={() => navigate("/duels")}>
                <Play className="w-4 h-4 mr-2" />
                {t("viewDuels")}
              </Button>
              <Button variant="outline" onClick={() => navigate("/lives")}>
                <Video className="w-4 h-4 mr-2" />
                {t("lives")}
              </Button>
              <Button variant="outline" onClick={() => navigate("/concerts")}>
                <Ticket className="w-4 h-4 mr-2" />
                {t("concerts")}
              </Button>
              <Button variant="outline" onClick={() => navigate("/gift-shop")}>
                <Gift className="w-4 h-4 mr-2" />
                {t("giftShop") || "Boutique cadeaux"}
              </Button>
              {isAdmin && (
                <Button variant="outline" onClick={() => navigate("/admin")} className="border-red-500/50 text-red-500 hover:bg-red-500/10">
                  <Crown className="w-4 h-4 mr-2" />
                  {t("adminDashboard")}
                </Button>
              )}
            </div>
          </Card>

          {/* === INTERFACE FAN === */}
          {isFan && (
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <Star className="w-6 h-6 text-green-500" />
                <h2 className="text-2xl font-bold">{t("fanSpace")}</h2>
              </div>

              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="sr-only">
                  <TabsTrigger value="dashboard" className="text-xs sm:text-sm">{t("dashboard")}</TabsTrigger>
                  <TabsTrigger value="followed" className="text-xs sm:text-sm">{t("followed")}</TabsTrigger>
                  <TabsTrigger value="subscription" className="text-xs sm:text-sm">{t("subscription")}</TabsTrigger>
                  <TabsTrigger value="referral" className="text-xs sm:text-sm"><Gift className="w-3 h-3 mr-1" />{t("referralProgram")}</TabsTrigger>
                  <TabsTrigger value="sponsor" className="text-xs sm:text-sm">Sponsor</TabsTrigger>
                  <TabsTrigger value="become-artist" className="text-xs sm:text-sm">{t("becomeArtist")}</TabsTrigger>
                  <TabsTrigger value="become-manager" className="text-xs sm:text-sm">{t("becomeManager")}</TabsTrigger>
                  <TabsTrigger value="notifications" className="text-xs sm:text-sm"><Bell className="w-3 h-3 mr-1" />{t("notifs")}</TabsTrigger>
                </TabsList>

                <TabsContent value="dashboard" className="space-y-6 mt-6">
                  {profile?.id && <RequestTracker userId={profile.id} />}
                  {profile?.id && <RewardMeetingCard userId={profile.id} />}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card className="p-6 text-center bg-gradient-to-br from-green-500/10 to-emerald-500/5 border-green-500/20">
                      <Award className="w-10 h-10 mx-auto mb-3 text-green-500" />
                      <p className="text-3xl font-bold">{fanStats.totalVotesCast}</p>
                      <p className="text-sm text-muted-foreground">{t("votesCast")}</p>
                    </Card>
                    <Card className="p-6 text-center bg-gradient-to-br from-pink-500/10 to-rose-500/5 border-pink-500/20">
                      <Gift className="w-10 h-10 mx-auto mb-3 text-pink-500" />
                      <p className="text-3xl font-bold">{fanStats.totalGiftsSent}</p>
                      <p className="text-sm text-muted-foreground">{t("giftsSent")}</p>
                    </Card>
                    <Card className="p-6 text-center bg-gradient-to-br from-blue-500/10 to-cyan-500/5 border-blue-500/20">
                      <Ticket className="w-10 h-10 mx-auto mb-3 text-blue-500" />
                      <p className="text-3xl font-bold">{fanStats.totalTickets}</p>
                      <p className="text-sm text-muted-foreground">{t("ticketsBought")}</p>
                    </Card>
                  </div>

                  <Card className="p-6">
                    <h3 className="text-lg font-semibold mb-4">{t("discoverContent")}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Button variant="outline" className="h-auto py-4 flex-col gap-2" onClick={() => navigate("/replays")}>
                        <Eye className="w-6 h-6" />
                        <span>{t("replaysVod")}</span>
                        <span className="text-xs text-muted-foreground">{t("watchOldDuels")}</span>
                      </Button>
                      <Button variant="outline" className="h-auto py-4 flex-col gap-2" onClick={() => navigate("/lifestyle")}>
                        <Video className="w-6 h-6" />
                        <span>{t("lifestyleVideos")}</span>
                        <span className="text-xs text-muted-foreground">{t("exclusiveArtistContent")}</span>
                      </Button>
                    </div>
                  </Card>
                </TabsContent>

                <TabsContent value="followed" className="mt-6">
                  <FollowedArtists userId={profile?.id || ""} />
                </TabsContent>

                <TabsContent value="subscription" className="mt-6">
                  <FanSubscription userId={profile?.id || ""} />
                </TabsContent>

                <TabsContent value="referral" className="mt-6">
                  <ReferralSection />
                </TabsContent>

                <TabsContent value="sponsor" className="mt-6">
                  <SponsorRequestSection />
                </TabsContent>

                <TabsContent value="become-artist" className="mt-6">
                  <ArtistValidationForm userId={profile?.id || ""} />
                </TabsContent>

                <TabsContent value="become-manager" className="mt-6">
                  <ManagerValidationForm userId={profile?.id || ""} />
                </TabsContent>

                <TabsContent value="notifications" className="mt-6 space-y-6">
                  <EmailNotificationPreferences userRoles={roles} />
                </TabsContent>
                <TabsContent value="preferences" className="mt-6 space-y-6">
                  <PreferencesPanel />
                </TabsContent>
                <TabsContent value="transactions" className="mt-6 space-y-6">
                  <TransactionsPanel />
                  <MyVotesHistory />
                  {profile?.id && <FanDedications userId={profile.id} />}
                </TabsContent>
              </Tabs>
            </div>
          )}

          {/* === INTERFACE ARTISTE === */}
          {isArtist && (
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <Mic className="w-6 h-6 text-purple-500" />
                <h2 className="text-2xl font-bold">{t("artistSpace")}</h2>
              </div>

              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="sr-only">
                  <TabsTrigger value="dashboard" className="text-xs sm:text-sm">{t("dashboard")}</TabsTrigger>
                  <TabsTrigger value="profile" className="text-xs sm:text-sm">{t("artistProfile")}</TabsTrigger>
                  <TabsTrigger value="duels" className="text-xs sm:text-sm">{t("duels")}</TabsTrigger>
                  <TabsTrigger value="concerts" className="text-xs sm:text-sm">{t("concerts")}</TabsTrigger>
                  <TabsTrigger value="lives" className="text-xs sm:text-sm">{t("lives")}</TabsTrigger>
                  <TabsTrigger value="competitions" className="text-xs sm:text-sm">{t("compMyCompetitions")}</TabsTrigger>
                  <TabsTrigger value="content" className="text-xs sm:text-sm">{t("content")}</TabsTrigger>
                  <TabsTrigger value="earnings" className="text-xs sm:text-sm">{t("earnings")}</TabsTrigger>
                  <TabsTrigger value="referral" className="text-xs sm:text-sm"><Gift className="w-3 h-3 mr-1" />{t("referralProgram")}</TabsTrigger>
                  <TabsTrigger value="notifications" className="text-xs sm:text-sm"><Bell className="w-3 h-3 mr-1" />{t("notifs")}</TabsTrigger>
                </TabsList>

                <TabsContent value="dashboard" className="space-y-6 mt-6">
                  {profile?.id && <RequestTracker userId={profile.id} />}
                  {profile?.id && <RewardMeetingCard userId={profile.id} />}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 relative isolate">
                    <Card className="p-5 text-center bg-card bg-gradient-to-br from-purple-500/10 to-pink-500/5 border-purple-500/20 transform-gpu">
                      <TrendingUp className="w-8 h-8 mx-auto mb-2 text-purple-500" />
                      <p className="text-2xl font-bold">{artistStats.totalVotes}</p>
                      <p className="text-xs text-muted-foreground">{t("votesReceived")}</p>
                    </Card>
                    <Card className="p-5 text-center bg-card bg-gradient-to-br from-pink-500/10 to-rose-500/5 border-pink-500/20 transform-gpu">
                      <Gift className="w-8 h-8 mx-auto mb-2 text-pink-500" />
                      <p className="text-2xl font-bold">{artistStats.totalGifts}</p>
                      <p className="text-xs text-muted-foreground">{t("giftsReceived")}</p>
                    </Card>
                    <Card className="p-5 text-center bg-card bg-gradient-to-br from-violet-500/10 to-purple-500/5 border-violet-500/20 transform-gpu">
                      <Music2 className="w-8 h-8 mx-auto mb-2 text-violet-500" />
                      <p className="text-2xl font-bold">{artistStats.totalDuels}</p>
                      <p className="text-xs text-muted-foreground">{t("duels")}</p>
                    </Card>
                    <Card className="p-5 text-center bg-card bg-gradient-to-br from-amber-500/10 to-yellow-500/5 border-amber-500/20 transform-gpu">
                      <Trophy className="w-8 h-8 mx-auto mb-2 text-amber-500" />
                      <p className="text-2xl font-bold">{artistStats.wonDuels}</p>
                      <p className="text-xs text-muted-foreground">{t("victories")}</p>
                    </Card>
                  </div>

                  {/* Mes duels */}
                  <Card className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold">{t("recentDuels")}</h3>
                      <Badge variant="outline">{myDuels.length} {t("total")}</Badge>
                    </div>
                    {myDuels.length > 0 ? (
                      <div className="space-y-3">
                        {myDuels.slice(0, 5).map((duel) => (
                          <div
                            key={duel.id}
                            className="flex items-center justify-between p-4 bg-accent/30 rounded-lg hover:bg-accent/50 transition-colors cursor-pointer"
                            onClick={() => navigate(`/duel/${duel.id}`)}
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center text-white">
                                <Music2 className="w-5 h-5" />
                              </div>
                              <div>
                                <p className="font-medium">{duel.artist1_name} vs {duel.artist2_name}</p>
                                {duel.scheduled_time && (
                                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                                    <Calendar className="w-3 h-3" />
                                    {fmtDateTime(duel.scheduled_time)}
                                  </p>
                                )}
                              </div>
                            </div>
                            {getStatusBadge(duel.status)}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-muted-foreground text-center py-8">{t("noDuelsYet")}</p>
                    )}
                  </Card>
                </TabsContent>

                <TabsContent value="profile" className="mt-6">
                  <ArtistPublicProfile userId={profile?.id || ""} />
                </TabsContent>

                <TabsContent value="duels" className="mt-6">
                  <DuelRequestForm userId={profile?.id || ""} />
                </TabsContent>

                <TabsContent value="concerts" className="mt-6 space-y-6">
                  <ArtistConcertManager userId={profile?.id || ""} />
                  <ArtistDedicationsManager artistId={profile?.id || ""} />
                </TabsContent>

                <TabsContent value="lives" className="mt-6">
                  <ArtistLivesManager userId={profile?.id || ""} onNavigate={navigate} />
                </TabsContent>

                <TabsContent value="competitions" className="mt-6">
                  <MyCompetitions userId={profile?.id || ""} />
                </TabsContent>


                <TabsContent value="content" className="space-y-6 mt-6">
                  <Card className="p-6">
                    <h3 className="text-lg font-semibold mb-4">{t("publishLifestyle")}</h3>
                    <LifestyleVideoUpload 
                      artistId={profile?.id || ""} 
                      artistName={fullName || t("profileFollowedDefaultName")}
                      onSuccess={loadProfile}
                    />
                  </Card>

                  <Card className="p-6">
                    <h3 className="text-lg font-semibold mb-4">{t("manageContent")}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Button className="h-auto py-4 flex-col gap-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white" onClick={() => navigate("/my-videos")}>
                        <Video className="w-6 h-6" />
                        <span>{t("myVideos")}</span>
                        <span className="text-xs opacity-80">{t("seePublications")}</span>
                      </Button>
                      <Button variant="outline" className="h-auto py-4 flex-col gap-2 border-purple-500/50" onClick={() => navigate("/my-replays")}>
                        <Eye className="w-6 h-6" />
                        <span>{t("myReplays")}</span>
                        <span className="text-xs text-muted-foreground">{t("reviewPerformances")}</span>
                      </Button>
                    </div>
                  </Card>
                </TabsContent>

                <TabsContent value="earnings" className="mt-6">
                  <WithdrawalForm userId={profile?.id || ""} availableBalance={wallet} />
                </TabsContent>

                <TabsContent value="referral" className="mt-6">
                  <ReferralSection />
                </TabsContent>

                <TabsContent value="notifications" className="mt-6 space-y-6">
                  <EmailNotificationPreferences userRoles={roles} />
                </TabsContent>
                <TabsContent value="preferences" className="mt-6"><PreferencesPanel /></TabsContent>
                <TabsContent value="transactions" className="mt-6 space-y-6"><TransactionsPanel /><MyVotesHistory /></TabsContent>
                <TabsContent value="followed" className="mt-6"><FollowedArtists userId={profile?.id || ""} /></TabsContent>
              </Tabs>
            </div>
          )}

          {/* === INTERFACE MANAGER === */}
          {isManager && (
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <Briefcase className="w-6 h-6 text-blue-500" />
                <h2 className="text-2xl font-bold">{t("managerSpace")}</h2>
              </div>

              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="sr-only">
                  <TabsTrigger value="dashboard" className="text-xs sm:text-sm">{t("dashboard")}</TabsTrigger>
                  <TabsTrigger value="duels" className="text-xs sm:text-sm">{t("myDuelsTab")}</TabsTrigger>
                  <TabsTrigger value="competitions" className="text-xs sm:text-sm">{t("compManagement")}</TabsTrigger>
                  <TabsTrigger value="profile" className="text-xs sm:text-sm">{t("artistProfile")}</TabsTrigger>
                  <TabsTrigger value="earnings" className="text-xs sm:text-sm">{t("earnings")}</TabsTrigger>
                  <TabsTrigger value="referral" className="text-xs sm:text-sm"><Gift className="w-3 h-3 mr-1" />{t("referralProgram")}</TabsTrigger>
                  <TabsTrigger value="notifications" className="text-xs sm:text-sm"><Bell className="w-3 h-3 mr-1" />{t("notifs")}</TabsTrigger>
                </TabsList>

                <TabsContent value="dashboard" className="space-y-6 mt-6">
                  {profile?.id && <RequestTracker userId={profile.id} />}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card className="p-6 text-center bg-gradient-to-br from-blue-500/10 to-cyan-500/5 border-blue-500/20">
                      <Users className="w-10 h-10 mx-auto mb-3 text-blue-500" />
                      <p className="text-3xl font-bold">{managerStats.totalDuelsManaged}</p>
                      <p className="text-sm text-muted-foreground">{t("duelsManaged")}</p>
                    </Card>
                    <Card className="p-6 text-center bg-gradient-to-br from-cyan-500/10 to-teal-500/5 border-cyan-500/20">
                      <Play className="w-10 h-10 mx-auto mb-3 text-cyan-500" />
                      <p className="text-3xl font-bold">{managerStats.activeDuels}</p>
                      <p className="text-sm text-muted-foreground">{t("inProgress")}</p>
                    </Card>
                    <Card className="p-6 text-center bg-gradient-to-br from-pink-500/10 to-rose-500/5 border-pink-500/20">
                      <Gift className="w-10 h-10 mx-auto mb-3 text-pink-500" />
                      <p className="text-3xl font-bold">{managerStats.totalGiftsReceived}</p>
                      <p className="text-sm text-muted-foreground">{t("giftsReceived")}</p>
                    </Card>
                  </div>

                  <Card className="p-6">
                    <h3 className="text-lg font-semibold mb-4">{t("quickActions")}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     <Button variant="outline" className="h-auto py-4 flex-col gap-2 border-blue-500/50" onClick={() => navigate("/duels")}>
                        <Eye className="w-6 h-6" />
                        <span>{t("allDuels")}</span>
                        <span className="text-xs text-muted-foreground">{t("seeCurrentDuels")}</span>
                      </Button>
                    </div>
                  </Card>
                </TabsContent>

                <TabsContent value="duels" className="mt-6">
                  <Card className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold">{t("duelsIManage")}</h3>
                     <Badge variant="outline">{managedDuels.length} {t("total")}</Badge>
                    </div>
                    {managedDuels.length > 0 ? (
                      <div className="space-y-3">
                        {managedDuels.map((duel) => (
                          <div
                            key={duel.id}
                            className="flex items-center justify-between p-4 bg-accent/30 rounded-lg hover:bg-accent/50 transition-colors cursor-pointer"
                            onClick={() => navigate(`/duel/${duel.id}`)}
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-gradient-to-r from-blue-500 to-cyan-500 flex items-center justify-center text-white">
                                <Briefcase className="w-5 h-5" />
                              </div>
                              <div>
                                <p className="font-medium">{duel.artist1_name} vs {duel.artist2_name}</p>
                                {duel.scheduled_time && (
                                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                                    <Calendar className="w-3 h-3" />
                                    {fmtDateTime(duel.scheduled_time)}
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {getStatusBadge(duel.status)}
                              {duel.status === "live" && (
                                <Button size="sm" variant="destructive" onClick={(e) => { e.stopPropagation(); navigate(`/duel/${duel.id}`); }}>
                                  {t("join")}
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                     <div className="text-center py-8">
                         <p className="text-muted-foreground mb-4">{t("noDuelsManaged")}</p>
                       </div>
                    )}
                  </Card>
                </TabsContent>

                <TabsContent value="competitions" className="mt-6">
                  <ManagerCompetitionsPanel managerId={profile?.id || ""} />
                </TabsContent>

                <TabsContent value="profile" className="mt-6">
                  <ManagerPublicProfileEditor userId={profile?.id || ""} userName={fullName || t("profileManagerRole")} />
                </TabsContent>

                <TabsContent value="earnings" className="mt-6">
                  <WithdrawalForm userId={profile?.id || ""} availableBalance={wallet} />
                </TabsContent>

                <TabsContent value="referral" className="mt-6">
                  <ReferralSection />
                </TabsContent>

                <TabsContent value="notifications" className="mt-6 space-y-6">
                  <EmailNotificationPreferences userRoles={roles} />
                </TabsContent>
                <TabsContent value="preferences" className="mt-6"><PreferencesPanel /></TabsContent>
                <TabsContent value="transactions" className="mt-6 space-y-6"><TransactionsPanel /><MyVotesHistory /></TabsContent>
                <TabsContent value="followed" className="mt-6"><FollowedArtists userId={profile?.id || ""} /></TabsContent>
              </Tabs>
            </div>
          )}

          {/* === INTERFACE ADMIN === */}
          {isAdmin && (
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <Crown className="w-6 h-6 text-red-500" />
                <h2 className="text-2xl font-bold">{t("administration")}</h2>
              </div>

              <AdminProfileStats />

              <ReferralSection />

              <Card className="p-6 bg-gradient-to-br from-red-500/10 to-orange-500/5 border-red-500/20">
                <p className="text-muted-foreground mb-4">
                  {t("adminDescription")}
                </p>
                <Button onClick={() => navigate("/admin")} className="bg-gradient-to-r from-red-500 to-orange-500 text-white">
                  <Crown className="w-4 h-4 mr-2" />
                  {t("openAdminDashboard")}
                </Button>
              </Card>
            </div>
          )}

          </div>
        </div>
      </main>
      <ProfileFooter />
    </div>
  );
};

export default Profile;
