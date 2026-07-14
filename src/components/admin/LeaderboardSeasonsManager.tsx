/**
 * Admin: LeaderboardSeasonsManager — gestion des saisons de classement.
 *
 * Crée/clôture les saisons (`leaderboard_seasons`), définit récompenses
 * Top 3 et mystères, et lance le fulfillment post-compétition. Les
 * gagnants sont gérés via `SeasonWinnersManager`.
 *
 * @access  role=admin
 * @see     src/components/admin/SeasonWinnersManager.tsx
 */
import { useState, useEffect } from "react";
import * as leaderboards from "@/api/endpoints/leaderboards";
import { listGifts } from "@/api/endpoints/gifts";
import { ApiError } from "@/api/http";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { useUiPreferences } from "@/hooks/useUiPreferences";
import { formatTz } from "@/lib/datetime";
import { Trophy, Plus, Trash2, Award, Crown, Edit } from "lucide-react";
import SeasonWinnersManager from "./SeasonWinnersManager";

interface Season { id: string; name: string; type: string; start_date: string; end_date: string; is_active: boolean; is_mystery_reward: boolean; }
interface Reward { id: string; season_id: string; rank_position: number; reward_type: string; credits_amount: number | null; virtual_gift_id: string | null; physical_description: string | null; }
interface VirtualGift { id: string; name: string; price: number; }

const LeaderboardSeasonsManager = () => {
  const { toast } = useToast();
  const { t, language } = useLanguage();
  const { prefs } = useUiPreferences();
  const tz = prefs.timezone;
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [gifts, setGifts] = useState<VirtualGift[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSeason, setEditingSeason] = useState<Season | null>(null);
  const [form, setForm] = useState({ name: "", type: "artist", start_date: "", end_date: "", is_active: true, is_mystery_reward: false });

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const [seasonsData, giftsData] = await Promise.all([
      leaderboards.listSeasons(),
      listGifts(),
    ]);
    // listSeasons() attaches each season's rewards under `.rewards`, so the
    // former `leaderboard_rewards` table read is folded into this list.
    const allRewards = ((seasonsData || []) as any[]).flatMap((s) => (s.rewards as Reward[]) || []);
    setSeasons((seasonsData || []) as unknown as Season[]);
    setRewards(allRewards);
    setGifts((giftsData || []).map((g) => ({ id: g.id, name: g.name, price: g.price_credits })));
    setLoading(false);
  };

  const openCreateDialog = () => { setEditingSeason(null); setForm({ name: "", type: "artist", start_date: "", end_date: "", is_active: true, is_mystery_reward: false }); setDialogOpen(true); };
  const openEditDialog = (season: Season) => { setEditingSeason(season); setForm({ name: season.name, type: season.type, start_date: season.start_date.slice(0, 16), end_date: season.end_date.slice(0, 16), is_active: season.is_active, is_mystery_reward: season.is_mystery_reward }); setDialogOpen(true); };

  const saveSeason = async () => {
    if (!form.name || !form.start_date || !form.end_date) { toast({ title: t("error"), description: t("adminSeasonsFillFields"), variant: "destructive" }); return; }
    const payload = { name: form.name, type: form.type, start_date: form.start_date, end_date: form.end_date, is_active: form.is_active, is_mystery_reward: form.is_mystery_reward };
    try {
      if (editingSeason) {
        await leaderboards.updateSeason(editingSeason.id, payload);
        toast({ title: t("adminSeasonsModified") });
      } else {
        await leaderboards.createSeason(payload);
        toast({ title: t("adminSeasonsCreated") });
      }
      setDialogOpen(false); loadData();
    } catch (e) {
      toast({ title: t("error"), description: e instanceof ApiError ? e.message : String(e), variant: "destructive" });
    }
  };

  const deleteSeason = async (id: string) => { try { await leaderboards.deleteSeason(id); toast({ title: t("adminSeasonsDeleted") }); loadData(); } catch (e) { toast({ title: t("error"), description: e instanceof ApiError ? e.message : String(e), variant: "destructive" }); } };
  const addReward = async (seasonId: string, rankPosition: number) => { try { await leaderboards.createReward(seasonId, { rank_position: rankPosition, reward_type: "credits", credits_amount: 100 }); loadData(); } catch (e) { toast({ title: t("error"), description: e instanceof ApiError ? e.message : String(e), variant: "destructive" }); } };
  const updateReward = async (rewardId: string, updates: Partial<Reward>) => { try { await leaderboards.updateReward(rewardId, updates as Record<string, unknown>); loadData(); } catch (e) { toast({ title: t("error"), description: e instanceof ApiError ? e.message : String(e), variant: "destructive" }); } };
  const deleteReward = async (rewardId: string) => { try { await leaderboards.deleteReward(rewardId); loadData(); } catch (e) { toast({ title: t("error"), description: e instanceof ApiError ? e.message : String(e), variant: "destructive" }); } };

  const fmt = (dt: string) => formatTz(dt, "dd MMM yyyy", { timezone: tz, language });

  if (loading) return <div className="text-center py-8 text-muted-foreground">{t("loading")}...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2"><Trophy className="w-5 h-5 text-primary" /> {t("adminSeasonsTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("adminSeasonsDesc")}</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild><Button onClick={openCreateDialog}><Plus className="w-4 h-4 mr-1" /> {t("adminSeasonsNew")}</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editingSeason ? t("adminSeasonsEdit") : t("adminSeasonsCreate")}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>{t("adminSeasonsName")}</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div>
                <Label>{t("adminSeasonsType")}</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="artist">{t("adminSeasonsTypeArtist")}</SelectItem>
                    <SelectItem value="donor">{t("adminSeasonsTypeDonor")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>{t("adminSeasonsStart")}</Label><Input type="datetime-local" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></div>
                <div><Label>{t("adminSeasonsEnd")}</Label><Input type="datetime-local" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></div>
              </div>
              <div className="flex items-center justify-between"><Label>{t("adminSeasonsActive")}</Label><Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} /></div>
              <div className="flex items-center justify-between"><Label>{t("adminSeasonsMystery")}</Label><Switch checked={form.is_mystery_reward} onCheckedChange={(v) => setForm({ ...form, is_mystery_reward: v })} /></div>
              <Button onClick={saveSeason} className="w-full">{editingSeason ? t("adminSeasonsSave") : t("adminSeasonsCreateBtn")}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {seasons.length === 0 && <Card><CardContent className="py-8 text-center text-muted-foreground">{t("adminSeasonsNone")}</CardContent></Card>}

      {seasons.map((season) => {
        const seasonRewards = rewards.filter(r => r.season_id === season.id).sort((a, b) => a.rank_position - b.rank_position);
        const nextRank = seasonRewards.length > 0 ? Math.max(...seasonRewards.map(r => r.rank_position)) + 1 : 1;
        return (
          <Card key={season.id} className={season.is_active ? "border-primary/50" : "opacity-70"}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    {season.name}
                    {season.is_active && <Badge className="bg-green-500">{t("adminSeasonsActive")}</Badge>}
                    {season.is_mystery_reward && <Badge variant="outline">🎁 {t("adminSeasonsMysteryType")}</Badge>}
                  </CardTitle>
                  <CardDescription>
                    {season.type === "artist" ? t("adminSeasonsArtistLeaderboard") : t("adminSeasonsDonorLeaderboard")} • {fmt(season.start_date)} → {fmt(season.end_date)}
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => openEditDialog(season)}><Edit className="w-4 h-4" /></Button>
                  <Button size="sm" variant="destructive" onClick={() => deleteSeason(season.id)}><Trash2 className="w-4 h-4" /></Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-2"><Award className="w-4 h-4" /> {t("adminSeasonsRewardsByRank")}</h4>
              <div className="space-y-2">
                {seasonRewards.map((reward) => (
                  <div key={reward.id} className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center font-bold text-sm">
                      {reward.rank_position <= 3 ? <Crown className="w-4 h-4 text-yellow-500" /> : `#${reward.rank_position}`}
                    </div>
                    <span className="text-sm font-medium w-8">#{reward.rank_position}</span>
                    <Select value={reward.reward_type} onValueChange={(v) => updateReward(reward.id, { reward_type: v, credits_amount: v === "credits" ? 100 : null, virtual_gift_id: null, physical_description: null })}>
                      <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="credits">{t("adminSeasonsCredits")}</SelectItem>
                        <SelectItem value="virtual_gift">{t("adminSeasonsVirtualGift")}</SelectItem>
                        <SelectItem value="physical">{t("adminSeasonsPhysical")}</SelectItem>
                        <SelectItem value="mystery">{t("adminSeasonsMysteryType")}</SelectItem>
                      </SelectContent>
                    </Select>
                    {reward.reward_type === "credits" && <Input type="number" value={reward.credits_amount || ""} onChange={(e) => updateReward(reward.id, { credits_amount: parseInt(e.target.value) || 0 })} className="w-24" placeholder={t("adminSeasonsCredits")} />}
                    {reward.reward_type === "virtual_gift" && (
                      <Select value={reward.virtual_gift_id || ""} onValueChange={(v) => updateReward(reward.id, { virtual_gift_id: v })}>
                        <SelectTrigger className="w-[180px]"><SelectValue placeholder={t("adminSeasonsChooseGift")} /></SelectTrigger>
                        <SelectContent>{gifts.map(g => <SelectItem key={g.id} value={g.id}>{g.name} ({g.price} Crédits)</SelectItem>)}</SelectContent>
                      </Select>
                    )}
                    {reward.reward_type === "physical" && <Input value={reward.physical_description || ""} onChange={(e) => updateReward(reward.id, { physical_description: e.target.value })} className="flex-1" placeholder={t("adminSeasonsLotDesc")} />}
                    {reward.reward_type === "mystery" && <span className="text-sm text-muted-foreground italic">{t("adminSeasonsSurprise")}</span>}
                    <Button size="sm" variant="ghost" onClick={() => deleteReward(reward.id)}><Trash2 className="w-3 h-3" /></Button>
                  </div>
                ))}
              </div>
              <Button size="sm" variant="outline" className="mt-3" onClick={() => addReward(season.id, nextRank)}>
                <Plus className="w-3 h-3 mr-1" /> {t("adminSeasonsAddRank")} #{nextRank}
              </Button>
              
              {/* Winner management - shown for past or inactive seasons */}
              {(() => {
                const now = new Date();
                const isPast = now > new Date(season.end_date);
                return (
                  <SeasonWinnersManager
                    seasonId={season.id}
                    seasonType={season.type}
                    rewards={seasonRewards}
                    isPast={isPast}
                  />
                );
              })()}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

export default LeaderboardSeasonsManager;
