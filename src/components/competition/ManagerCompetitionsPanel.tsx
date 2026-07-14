/**
 * Panel manager — gestion personnelle des compétitions dans le profil.
 * Création, suivi par statut (brouillon/publié/live/terminé), accès rapide
 * à la page détail/live pour ouvrir candidatures, modération, scène.
 *
 * EN — Manager-only competitions panel embedded in Profile.
 *
 * @access role=manager
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { Plus, Trophy, Globe, MapPin, Calendar, Users, Radio, CheckCircle2, FileText, ChevronRight, Pencil } from "lucide-react";
import * as competitions from "@/api/endpoints/competitions";
import { useLanguage } from "@/contexts/LanguageContext";
import { formatTz } from "@/lib/datetime";
import { useUiPreferences } from "@/hooks/useUiPreferences";
import CompetitionForm from "@/components/competition/CompetitionForm";
import { SponsorDeadlineControl } from "@/components/sponsor/SponsorDeadlineControl";

interface Props { managerId: string }

const statusMeta: Record<string, { color: string; icon: any }> = {
  draft:      { color: "bg-muted text-foreground",                                icon: FileText },
  published:  { color: "bg-blue-500/15 text-blue-400 border-blue-500/30",         icon: CheckCircle2 },
  live:       { color: "bg-red-500/20 text-red-400 border-red-500/40 animate-pulse", icon: Radio },
  finished:   { color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", icon: Trophy },
};

export const ManagerCompetitionsPanel = ({ managerId }: Props) => {
  const { t, language } = useLanguage();
  const { prefs } = useUiPreferences();
  const navigate = useNavigate();
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [tab, setTab] = useState("all");

  const load = async () => {
    setLoading(true);
    try {
      const data = await competitions.myCompetitions();
      setList((data as any[]) || []);
    } catch {
      setList([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (managerId) load(); }, [managerId]);

  const stats = useMemo(() => ({
    total: list.length,
    draft: list.filter(c => c.status === "draft").length,
    published: list.filter(c => c.status === "published").length,
    live: list.filter(c => c.status === "live").length,
    finished: list.filter(c => c.status === "finished").length,
  }), [list]);

  const filtered = useMemo(() => {
    if (tab === "all") return list;
    return list.filter(c => c.status === tab);
  }, [list, tab]);

  const renderCard = (c: any) => {
    const meta = statusMeta[c.status] || statusMeta.draft;
    const Icon = meta.icon;
    return (
      <Card key={c.id} className="overflow-hidden hover:border-primary/50 transition-all group cursor-pointer"
        onClick={() => navigate(`/competition/${c.id}`)}>
        <CardContent className="p-0">
          <div className="flex items-stretch">
            {c.cover_url ? (
              <img src={c.cover_url} alt={c.title} className="w-28 h-28 object-cover shrink-0" />
            ) : (
              <div className="w-28 h-28 shrink-0 bg-gradient-to-br from-primary/30 to-amber-500/20 flex items-center justify-center">
                <Trophy className="w-9 h-9 text-primary/70" />
              </div>
            )}
            <div className="flex-1 p-4 min-w-0 space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className={meta.color}>
                  <Icon className="w-3 h-3 mr-1" />
                  {t("compStatus" + c.status.charAt(0).toUpperCase() + c.status.slice(1))}
                </Badge>
                <Badge variant="outline" className="text-[10px]">
                  {c.mode === "online"
                    ? <><Globe className="w-3 h-3 mr-1" />{t("compOnline")}</>
                    : <><MapPin className="w-3 h-3 mr-1" />{t("compOnsite")}</>}
                </Badge>
              </div>
              <h4 className="font-semibold truncate group-hover:text-primary transition-colors">{c.title}</h4>
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
                {c.start_at && (
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {formatTz(c.start_at, "PPp", { timezone: prefs.timezone, language })}
                  </span>
                )}
                {typeof c.max_candidates === "number" && (
                  <span className="flex items-center gap-1">
                    <Users className="w-3 h-3" />{c.max_candidates} max
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 pr-3">
              {c.status !== "live" && c.status !== "finished" && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={(e) => { e.stopPropagation(); setEditing(c); setShowForm(false); }}
                  title={t("edit") || "Modifier"}
                >
                  <Pencil className="w-4 h-4" />
                </Button>
              )}
              <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
          </div>
          {c.status !== "finished" && (
            <div className="border-t p-3" onClick={(e) => e.stopPropagation()}>
              <SponsorDeadlineControl
                table="competitions"
                rowId={c.id}
                currentValue={c.sponsor_submission_deadline}
                onSaved={(iso) => setList((prev) => prev.map((x) => x.id === c.id ? { ...x, sponsor_submission_deadline: iso } : x))}
              />
            </div>
          )}
        </CardContent>
      </Card>
    );
  };


  const StatTile = ({ label, value, gradient, icon: I }: any) => (
    <Card className={`relative overflow-hidden border-0 ${gradient}`}>
      <CardContent className="p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-background/30 backdrop-blur flex items-center justify-center">
          <I className="w-5 h-5" />
        </div>
        <div>
          <p className="text-2xl font-bold leading-none">{value}</p>
          <p className="text-[11px] text-muted-foreground mt-1">{label}</p>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Trophy className="w-5 h-5 text-primary" />
            {t("compManagement")}
          </h2>
          <p className="text-xs text-muted-foreground mt-1">{t("compManagementSubtitle")}</p>
        </div>
        <Button onClick={() => setShowForm(v => !v)} className="bg-gradient-to-r from-primary to-amber-500 text-black hover:opacity-90">
          <Plus className="w-4 h-4 mr-1" />
          {showForm ? t("cancel") : t("compNew")}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile label={t("compStatusPublished")} value={stats.published} gradient="bg-gradient-to-br from-blue-500/15 to-blue-500/5" icon={CheckCircle2} />
        <StatTile label={t("compStatusLive")} value={stats.live} gradient="bg-gradient-to-br from-red-500/15 to-red-500/5" icon={Radio} />
        <StatTile label={t("compStatusDraft")} value={stats.draft} gradient="bg-gradient-to-br from-muted/40 to-muted/10" icon={FileText} />
        <StatTile label={t("compStatusFinished")} value={stats.finished} gradient="bg-gradient-to-br from-emerald-500/15 to-emerald-500/5" icon={Trophy} />
      </div>

      {/* Form inline (create or edit) */}
      {(showForm || editing) && (
        <Card className="border-primary/30">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">
                {editing ? `${t("edit") || "Modifier"} — ${editing.title}` : t("compNew")}
              </h3>
              <Button size="sm" variant="ghost" onClick={() => { setShowForm(false); setEditing(null); }}>
                {t("cancel")}
              </Button>
            </div>
            <CompetitionForm
              managerId={managerId}
              initial={editing || undefined}
              onSaved={() => { setShowForm(false); setEditing(null); load(); }}
            />
          </CardContent>
        </Card>
      )}

      {/* Tabs filter */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="all">{t("all")} <span className="ml-1 opacity-60">({stats.total})</span></TabsTrigger>
          <TabsTrigger value="draft">{t("compStatusDraft")} <span className="ml-1 opacity-60">({stats.draft})</span></TabsTrigger>
          <TabsTrigger value="published">{t("compStatusPublished")} <span className="ml-1 opacity-60">({stats.published})</span></TabsTrigger>
          <TabsTrigger value="live">{t("compStatusLive")} <span className="ml-1 opacity-60">({stats.live})</span></TabsTrigger>
          <TabsTrigger value="finished">{t("compStatusFinished")} <span className="ml-1 opacity-60">({stats.finished})</span></TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          {loading ? (
            <p className="text-muted-foreground text-sm">{t("artistProfileLoading")}</p>
          ) : !filtered.length ? (
            <EmptyState
              icon={<Trophy />}
              title={t("compNoCompetitions")}
              description={t("compManagerEmptyDesc")}
              action={{ label: t("compNew"), onClick: () => setShowForm(true) }}
              fullHeight={false}
            />
          ) : (
            <div className="space-y-3">{filtered.map(renderCard)}</div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ManagerCompetitionsPanel;
