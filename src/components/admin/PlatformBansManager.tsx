/**
 * PlatformBansManager
 * -------------------
 * Gestion des bannissements GLOBAUX de la plateforme (admin only).
 *
 * Distinct des bans event-scoped (`stream_bans`) qui ne concernent qu'un
 * live/concert/duel. Ici : impact sur toute l'app — l'utilisateur est
 * redirigé vers la page Contact pour faire appel.
 *
 * Champs :
 *  - durée temporaire (expires_at) OU bannissement définitif (null)
 *  - motif obligatoire (journalisé dans `admin_logs`)
 *
 * Émet une notification à l'utilisateur via `notify-user-event`.
 */
import { useEffect, useState } from "react";
import { createPlatformBan, listPlatformBans, unbanPlatform } from "@/api/endpoints/moderation";
import { searchUsers } from "@/api/endpoints/admin";
import { ApiError } from "@/api/http";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Ban, Undo2, ShieldAlert, UserSearch } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useUiPreferences } from "@/hooks/useUiPreferences";
import { formatTz } from "@/lib/datetime";
import { useToast } from "@/hooks/use-toast";

interface ProfileRow {
  id: string;
  full_name: string | null;
  email: string;
  avatar_url: string | null;
  is_banned: boolean | null;
  banned_at: string | null;
  banned_reason: string | null;
  banned_until: string | null;
  banned_is_permanent: boolean | null;
}

type DurationKey = "24h" | "7d" | "30d" | "permanent";

/**
 * Platform-wide bans (account suspended).
 * - Lists every suspended account with duration (or permanent).
 * - Lets admin search any user and apply a new ban with a chosen duration.
 * - Revoking the ban clears all ban fields and notifies the user via trigger? (no notif on lift).
 */
export const PlatformBansManager = () => {
  const { language } = useLanguage();
  const { prefs } = useUiPreferences();
  const tz = prefs.timezone;
  const { toast } = useToast();
  const [rows, setRows] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<ProfileRow[]>([]);
  const [target, setTarget] = useState<ProfileRow | null>(null);
  const [duration, setDuration] = useState<DurationKey>("7d");
  const [reason, setReason] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => { void load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const data = await listPlatformBans();
      setRows((data as unknown as ProfileRow[]) || []);
    } catch {
      setRows([]);
    }
    setLoading(false);
  };

  const search = async (term: string) => {
    setSearchTerm(term);
    if (!term.trim()) { setSearchResults([]); return; }
    try {
      const data = await searchUsers(term);
      setSearchResults((data as unknown as ProfileRow[]) || []);
    } catch {
      setSearchResults([]);
    }
  };

  const ban = async () => {
    if (!target) return;
    const now = new Date();
    let until: Date | null = null;
    let permanent = false;
    if (duration === "24h") until = new Date(now.getTime() + 24 * 3600 * 1000);
    else if (duration === "7d") until = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
    else if (duration === "30d") until = new Date(now.getTime() + 30 * 24 * 3600 * 1000);
    else permanent = true;

    try {
      await createPlatformBan({
        userId: target.id,
        reason: reason.trim() || (language === "fr" ? "Suspension administrative" : "Administrative suspension"),
        permanent,
        until: until ? until.toISOString() : null,
      });
    } catch (e) {
      toast({ title: "Erreur", description: e instanceof ApiError ? e.message : String(e), variant: "destructive" });
      return;
    }
    toast({ title: language === "fr" ? "Compte suspendu" : "Account suspended" });
    setDialogOpen(false); setTarget(null); setReason(""); setDuration("7d"); setSearchTerm(""); setSearchResults([]);
    void load();
  };

  const lift = async (id: string) => {
    await unbanPlatform(id);
    toast({ title: language === "fr" ? "Suspension levée" : "Suspension lifted" });
    void load();
  };

  const fmt = (dt: string | null) => dt ? formatTz(dt, "dd MMM yyyy HH:mm", { timezone: tz, language }) : "—";

  const tr = language === "en"
    ? { title: "Platform suspensions", subtitle: "Account-level suspensions issued by admins. May be temporary (with end date) or permanent.",
        empty: "No account currently suspended.", lift: "Lift suspension", newBan: "Suspend a user",
        permanent: "Permanent", until: "Until", reason: "Reason", searchPh: "Search by name or email",
        choose: "Choose a duration", dur24: "24 hours", dur7: "7 days", dur30: "30 days", durPerma: "Permanent",
        reasonPh: "Reason communicated to the user" }
    : { title: "Suspensions de compte", subtitle: "Suspensions d'accès à la plateforme posées par l'admin. Peuvent être temporaires (avec date de fin) ou définitives.",
        empty: "Aucun compte actuellement suspendu.", lift: "Lever la suspension", newBan: "Suspendre un utilisateur",
        permanent: "Définitive", until: "Jusqu'au", reason: "Motif", searchPh: "Rechercher par nom ou email",
        choose: "Choisir une durée", dur24: "24 heures", dur7: "7 jours", dur30: "30 jours", durPerma: "Définitive",
        reasonPh: "Motif communiqué à l'utilisateur" };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2"><ShieldAlert className="w-5 h-5" />{tr.title}</CardTitle>
            <CardDescription>{tr.subtitle}</CardDescription>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="destructive"><Ban className="w-3 h-3 mr-1" />{tr.newBan}</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{tr.newBan}</DialogTitle>
                <DialogDescription>{tr.subtitle}</DialogDescription>
              </DialogHeader>
              {!target ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <UserSearch className="w-4 h-4 text-muted-foreground" />
                    <Input placeholder={tr.searchPh} value={searchTerm} onChange={(e) => search(e.target.value)} />
                  </div>
                  <ScrollArea className="max-h-[260px]">
                    <div className="space-y-1">
                      {searchResults.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => setTarget(p)}
                          className="w-full flex items-center gap-2 p-2 hover:bg-muted/40 rounded-md text-left"
                        >
                          <Avatar className="w-7 h-7">
                            <AvatarImage src={p.avatar_url || ""} />
                            <AvatarFallback className="text-[10px]">{(p.full_name || p.email || "?")[0]}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{p.full_name || "—"}</p>
                            <p className="text-[11px] text-muted-foreground truncate">{p.email}</p>
                          </div>
                          {p.is_banned && <Badge variant="destructive" className="text-[10px] ml-auto">{language === "fr" ? "Banni" : "Banned"}</Badge>}
                        </button>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 p-2 bg-muted/30 rounded-md">
                    <Avatar className="w-8 h-8">
                      <AvatarImage src={target.avatar_url || ""} />
                      <AvatarFallback>{(target.full_name || target.email)[0]}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{target.full_name || "—"}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{target.email}</p>
                    </div>
                    <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setTarget(null)}>×</Button>
                  </div>
                  <div>
                    <p className="text-xs font-medium mb-1">{tr.choose}</p>
                    <Select value={duration} onValueChange={(v) => setDuration(v as DurationKey)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="24h">{tr.dur24}</SelectItem>
                        <SelectItem value="7d">{tr.dur7}</SelectItem>
                        <SelectItem value="30d">{tr.dur30}</SelectItem>
                        <SelectItem value="permanent">{tr.durPerma}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <p className="text-xs font-medium mb-1">{tr.reason}</p>
                    <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder={tr.reasonPh} className="min-h-[80px]" />
                  </div>
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>{language === "fr" ? "Annuler" : "Cancel"}</Button>
                <Button variant="destructive" disabled={!target} onClick={ban}>
                  <Ban className="w-3 h-3 mr-1" />{tr.newBan}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            <ShieldAlert className="w-12 h-12 mx-auto mb-2 opacity-30" />
            <p>{tr.empty}</p>
          </div>
        ) : (
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-2">
              {rows.map((p) => (
                <div key={p.id} className="border border-border rounded-lg p-3 bg-card/50 flex items-start justify-between gap-2 flex-wrap">
                  <div className="flex items-start gap-2 min-w-0 flex-1">
                    <Avatar className="w-9 h-9">
                      <AvatarImage src={p.avatar_url || ""} />
                      <AvatarFallback>{(p.full_name || p.email)[0]}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{p.full_name || "—"}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{p.email}</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {p.banned_is_permanent ? (
                          <Badge variant="destructive" className="text-[10px]">{tr.permanent}</Badge>
                        ) : p.banned_until ? (
                          <Badge variant="outline" className="text-[10px]">{tr.until} {fmt(p.banned_until)}</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">—</Badge>
                        )}
                      </div>
                      {p.banned_reason && <p className="text-xs text-muted-foreground mt-1 italic">« {p.banned_reason} »</p>}
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => lift(p.id)}>
                    <Undo2 className="w-3 h-3 mr-1" />{tr.lift}
                  </Button>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
};

export default PlatformBansManager;
