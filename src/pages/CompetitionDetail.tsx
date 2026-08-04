/**
 * Page: CompetitionDetail — affiche les détails d'une compétition
 * (présentielle ou en ligne) avec actions selon le rôle :
 *
 *  - Tout le monde : voir l'affiche, la liste des candidats approuvés.
 *  - Artiste éligible : bouton Candidater (avant deadline).
 *  - Spectateur : Acheter le billet (si payant) puis Rejoindre le direct.
 *  - Manager propriétaire : Modifier, Voir candidatures, Publier.
 *
 * EN — Competition detail page with role-aware actions.
 */
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEO from "@/components/seo/SEO";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { getCompetition, listCandidates, myTicket } from "@/api/endpoints/competitions";
import { formatTz } from "@/lib/datetime";
import { useUiPreferences } from "@/hooks/useUiPreferences";
import { Calendar, MapPin, Globe, Gift, Users, Trophy } from "lucide-react";
import CompetitionApplyDialog from "@/components/competition/CompetitionApplyDialog";
import CompetitionTicketDialog from "@/components/competition/CompetitionTicketDialog";
import CompetitionCandidatesList from "@/components/competition/CompetitionCandidatesList";
import CompetitionCandidateReview from "@/components/competition/CompetitionCandidateReview";
import CompetitionPublishDialog from "@/components/competition/CompetitionPublishDialog";
import { ShareButton } from "@/components/sharing/ShareButton";

const CompetitionDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t, language } = useLanguage();
  const { prefs } = useUiPreferences();
  const { user, roles } = useAuth();
  const [comp, setComp] = useState<any>(null);
  const [hasTicket, setHasTicket] = useState(false);
  const [hasApplied, setHasApplied] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);
  const [ticketOpen, setTicketOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);

  const load = async () => {
    try {
      setComp(await getCompetition(id!));
    } catch {
      setComp(null);
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  useEffect(() => {
    if (!user || !id) return;
    (async () => {
      try {
        const tk = await myTicket(id);
        setHasTicket(!!tk.hasTicket);
      } catch {
        setHasTicket(false);
      }
      try {
        const cands = await listCandidates(id);
        setHasApplied((cands as any[]).some((c) => c.artist_id === user.id));
      } catch {
        setHasApplied(false);
      }
    })();
  }, [user, id]);

  if (!comp) return <div className="min-h-screen bg-background"><Header /><main className="container py-6">…</main></div>;

  const isManager = user?.id === comp.manager_id;
  const isAdmin = roles.includes("admin");
  const isArtist = roles.includes("artist");
  const deadlinePassed = new Date(comp.application_deadline) < new Date();
  const applicationsNotOpenYet = comp.application_opens_at && new Date(comp.application_opens_at) > new Date();
  const liveAvailable = ["live", "published"].includes(comp.status) && new Date(comp.start_at) <= new Date();
  const canAccess = !comp.is_public_paid || hasTicket || isManager || isAdmin;

  return (
    <div className="min-h-screen bg-background">
      <SEO title={`${comp.title} — ${t("competitions")}`} description={comp.description || comp.title} />
      <Header />
      <main className="container py-6 space-y-4 max-w-4xl">
        {comp.cover_url && <img src={comp.cover_url} alt={comp.title} className="w-full h-auto max-h-[70vh] object-contain rounded-lg bg-muted/30" />}

        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-3xl font-bold">{comp.title}</h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant={comp.status === "live" ? "destructive" : "secondary"}>
                {t("compStatus" + comp.status.charAt(0).toUpperCase() + comp.status.slice(1))}
              </Badge>
              <Badge variant="outline">{comp.mode === "online" ? <Globe className="w-3 h-3 mr-1" /> : <MapPin className="w-3 h-3 mr-1" />}{t(comp.mode === "online" ? "compOnline" : "compOnsite")}</Badge>
              {comp.is_public_paid ? <Badge>{t("compPaid")} · {comp.viewer_ticket_price}</Badge> : <Badge variant="outline">{t("compFree")}</Badge>}
            </div>
          </div>
          <ShareButton contentType="duel" contentId={comp.id} title={comp.title} />
        </div>

        {comp.description && <p className="text-muted-foreground whitespace-pre-line">{comp.description}</p>}

        <Card>
          <CardContent className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
            <p className="flex items-center gap-2"><Calendar className="w-4 h-4" /> <b>{t("compStartAt")}:</b> {formatTz(comp.start_at, "PPp", { timezone: prefs.timezone, language })}</p>
            <p className="flex items-center gap-2"><Calendar className="w-4 h-4" /> <b>{t("compEndAt")}:</b> {formatTz(comp.end_at, "PPp", { timezone: prefs.timezone, language })}</p>
            {comp.application_opens_at && (
              <p className="flex items-center gap-2"><Calendar className="w-4 h-4" /> <b>{t("compApplicationOpensAt")}:</b> {formatTz(comp.application_opens_at, "PPp", { timezone: prefs.timezone, language })}</p>
            )}
            <p className="flex items-center gap-2"><Calendar className="w-4 h-4" /> <b>{t("compApplicationDeadline")}:</b> {formatTz(comp.application_deadline, "PPp", { timezone: prefs.timezone, language })}</p>
            <p className="flex items-center gap-2"><Users className="w-4 h-4" /> <b>{t("compMaxCandidates")}:</b> {comp.max_candidates}</p>
            {comp.reward_description && <p className="flex items-center gap-2"><Trophy className="w-4 h-4" /> <b>{t("compReward")}:</b> {comp.reward_description}</p>}
            {comp.entry_fee_required && <p className="flex items-center gap-2"><Gift className="w-4 h-4" /> <b>{t("compEntryFee")}:</b> {comp.entry_fee_amount}</p>}
            {comp.mode === "onsite" && (
              <p className="col-span-2 flex items-start gap-2"><MapPin className="w-4 h-4 mt-0.5" /> <span><b>{comp.venue_name}</b> — {comp.venue_address}, {comp.district}, {comp.commune}, {comp.city}, {comp.country}<br /><span className="text-xs text-muted-foreground">{comp.venue_contact}</span></span></p>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-2">
          {isArtist && !isManager && !hasApplied && !deadlinePassed && comp.status === "published" && (
            <Button onClick={() => setApplyOpen(true)} disabled={!!applicationsNotOpenYet}>
              {applicationsNotOpenYet ? t("compApplicationsNotOpenYet") : t("compApply")}
            </Button>
          )}
          {isArtist && hasApplied && <Badge variant="secondary">{t("compApplied")}</Badge>}
          {comp.is_public_paid && !hasTicket && !isManager && (
            <Button variant="outline" onClick={() => setTicketOpen(true)}>{t("compBuyTicket")}</Button>
          )}
          {liveAvailable && canAccess && (
            <Button variant="default" onClick={() => navigate(`/competition/${comp.id}/live`)}>{t("compJoinLive")}</Button>
          )}
          {isManager && comp.status !== "published" && comp.status !== "live" && comp.status !== "finished" && (
            <Button onClick={() => setPublishOpen(true)}>{t("compPublish")}</Button>
          )}
        </div>

        <div>
          <h2 className="font-bold text-lg mt-4 mb-2">{t("compCandidates")}</h2>
          <CompetitionCandidatesList competitionId={comp.id} />
        </div>

        {(isManager || isAdmin) && (
          <div>
            <h2 className="font-bold text-lg mt-4 mb-2">Review</h2>
            <CompetitionCandidateReview competitionId={comp.id} />
          </div>
        )}
      </main>
      <Footer />

      <CompetitionApplyDialog competition={comp} open={applyOpen} onOpenChange={setApplyOpen} onApplied={() => setHasApplied(true)} />
      <CompetitionTicketDialog competition={comp} open={ticketOpen} onOpenChange={setTicketOpen} onPurchased={() => setHasTicket(true)} />
      <CompetitionPublishDialog competitionId={comp.id} open={publishOpen} onOpenChange={setPublishOpen} onPublished={load} />
    </div>
  );
};

export default CompetitionDetail;
