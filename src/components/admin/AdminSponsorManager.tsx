/**
 * Admin: AdminSponsorManager — modération des sponsors et de leurs annonces.
 *
 * Validation des demandes sponsor, gestion des tiers de prix (voir
 * `SponsorPriceTiersManager`), diffusion programmée des pubs in-stream
 * (`SponsorAdBroadcast`). Les actions sont journalisées dans `admin_logs`.
 *
 * @access  role=admin
 */
import { useEffect, useState } from "react";
import * as sponsors from "@/api/endpoints/sponsors";
import { uploadFile } from "@/api/endpoints/uploads";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { Megaphone, Upload, CheckCircle2, XCircle, Loader2, DollarSign, Eye, Clock, CreditCard, PlayCircle } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { SponsorPriceTiersManager } from "./SponsorPriceTiersManager";

export const AdminSponsorManager = () => {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [requests, setRequests] = useState<any[]>([]);
  const [ads, setAds] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [priceDialog, setPriceDialog] = useState<{ id: string } | null>(null);
  const [price, setPrice] = useState("");
  const [uploadDialog, setUploadDialog] = useState<{ event_type: string; event_id: string } | null>(null);
  const [adTitle, setAdTitle] = useState("");
  const [adFile, setAdFile] = useState<File | null>(null);
  const [adDuration, setAdDuration] = useState("30");
  const [working, setWorking] = useState(false);
  const { user } = useAuth();
  const [reuseConfirm, setReuseConfirm] = useState<any | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [r, adsRes] = await Promise.all([
        sponsors.listRequests({ limit: 100 }),
        sponsors.listAdVideos(),
      ]);
      setRequests((r as any[]) || []);
      setAds((adsRes as any[]) || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openPriceDialog = async (req: any) => {
    setPriceDialog({ id: req.id });
    // Auto-suggest from configured tier (if duration is known on the request).
    let suggested = "";
    if (req.media_duration_seconds) {
      try {
        const dp: any = await sponsors.defaultPrice({ duration: req.media_duration_seconds });
        if (dp?.priceCredits != null) suggested = String(dp.priceCredits);
      } catch { /* no suggestion available */ }
    }
    setPrice(suggested);
  };

  const setPriceConfirm = async () => {
    if (!priceDialog || !price) return;
    const p = parseFloat(price);
    if (p <= 0) return;
    setWorking(true);
    try {
      await sponsors.setRequestPrice(priceDialog.id, { priceCredits: p });
      toast({ title: "Prix envoyé au demandeur" });
      setPriceDialog(null); setPrice(""); load();
    } catch (e: any) {
      toast({ title: "Erreur", description: e?.message, variant: "destructive" });
    } finally {
      setWorking(false);
    }
  };

  const approve = async (id: string) => {
    try {
      await sponsors.reviewRequest(id, { status: "approved" });
      toast({ title: "Sponsor approuvé" }); load();
    } catch (e: any) {
      toast({ title: "Erreur", description: e?.message, variant: "destructive" });
    }
  };

  const reject = async (id: string) => {
    const reason = window.prompt("Raison du rejet ?") || "";
    try {
      await sponsors.reviewRequest(id, { status: "rejected", rejected_reason: reason });
      toast({ title: "Sponsor rejeté" }); load();
    } catch (e: any) {
      toast({ title: "Erreur", description: e?.message, variant: "destructive" });
    }
  };

  const uploadAd = async () => {
    if (!uploadDialog || !adFile || !adTitle || !user) return;
    setWorking(true);
    try {
      const videoUrl = await uploadFile(adFile, "sponsor");
      await sponsors.createAdVideo({
        event_type: uploadDialog.event_type, event_id: uploadDialog.event_id,
        title: adTitle, video_url: videoUrl, duration_seconds: parseInt(adDuration) || 30,
        uploaded_by: user.id,
      });
      toast({ title: "Vidéo finale téléversée" });
      setUploadDialog(null); setAdTitle(""); setAdFile(null); load();
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally { setWorking(false); }
  };

  const toggleActive = async (id: string, active: boolean) => {
    await sponsors.updateAdVideo(id, { is_active: active });
    load();
  };

  const approveReuseMedia = (r: any) => {
    if (r.media_type !== "video") {
      toast({ title: "Le média doit être une vidéo pour être approuvé tel quel", variant: "destructive" });
      return;
    }
    setReuseConfirm(r);
  };

  const confirmReuseMedia = async () => {
    const r = reuseConfirm;
    if (!r) return;
    setWorking(true);
    try {
      await sponsors.approveReuse(r.id, {
        mediaUrl: r.media_url,
        durationSeconds: r.media_duration_seconds || 30,
      });
      toast({ title: "Vidéo validée et publiée" });
      load();
    } catch (e: any) {
      toast({ title: "Erreur", description: e?.message, variant: "destructive" });
    } finally {
      setWorking(false);
      setReuseConfirm(null);
    }
  };

  const pendingCount = requests.filter(r => r.status === "pending" || r.status === "paid").length;

  const renderRequest = (r: any) => (
    <div key={r.id} className="border rounded-lg p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <Badge variant="outline" className="mb-1">{r.event_type}</Badge>
          {r.media_duration_seconds ? <Badge variant="outline" className="ml-1 mb-1">{r.media_duration_seconds}s</Badge> : null}
          <p className="text-sm font-medium">{r.description}</p>
          {(() => {
            const map: Record<string, { key: string; cls: string; Icon: any }> = {
              pending: { key: "sponsorStatusPending", cls: "bg-yellow-500/20 text-yellow-700", Icon: Clock },
              awaiting_payment: { key: "sponsorStatusAwaitingPayment", cls: "bg-orange-500/20 text-orange-700", Icon: CreditCard },
              paid: { key: "sponsorStatusPaid", cls: "bg-blue-500/20 text-blue-700", Icon: Clock },
              approved: { key: "sponsorStatusApproved", cls: "bg-green-500/20 text-green-700", Icon: CheckCircle2 },
              rejected: { key: "sponsorStatusRejected", cls: "bg-red-500/20 text-red-700", Icon: XCircle },
              cancelled: { key: "sponsorStatusCancelled", cls: "bg-gray-500/20 text-gray-700", Icon: XCircle },
              active: { key: "sponsorStatusActive", cls: "bg-green-500/20 text-green-700", Icon: CheckCircle2 },
              expired: { key: "sponsorStatusExpired", cls: "bg-gray-500/20 text-gray-700", Icon: XCircle },
            };
            const v = map[r.status] || map.pending;
            return <Badge className={`mt-1 ${v.cls}`}><v.Icon className="w-3 h-3 mr-1" />{t(v.key)}</Badge>;
          })()}
        </div>
        <a href={r.media_url} target="_blank" rel="noopener" className="text-xs text-primary underline">Voir le média</a>
      </div>
      <div className="flex flex-wrap gap-2">
        {r.status === "pending" && (
          <>
            <Button size="sm" onClick={() => openPriceDialog(r)}>
              <DollarSign className="w-3 h-3 mr-1" /> Fixer prix
            </Button>
            <Button size="sm" variant="destructive" onClick={() => reject(r.id)}>Rejeter</Button>
          </>
        )}
        {r.status === "paid" && (
          <>
            <Button size="sm" onClick={() => approve(r.id)}><CheckCircle2 className="w-3 h-3 mr-1" /> Approuver</Button>
            {r.media_type === "video" && (
              <Button size="sm" variant="secondary" onClick={() => approveReuseMedia(r)}>
                <PlayCircle className="w-3 h-3 mr-1" /> Valider la vidéo telle quelle
              </Button>
            )}
            <Button size="sm" variant="destructive" onClick={() => reject(r.id)}>Rembourser & rejeter</Button>
          </>
        )}
        {r.status === "approved" && (() => {
          const existingAd = ads.find(a => a.event_type === r.event_type && a.event_id === r.event_id);
          return (
            <div className="w-full space-y-2">
              {existingAd && (
                <div className="flex items-center gap-2 p-2 rounded-md bg-green-500/10 border border-green-500/30">
                  <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                  <div className="flex-1 min-w-0 text-xs">
                    <p className="font-semibold text-green-700 truncate">
                      Pub déjà en ligne : « {existingAd.title} »
                    </p>
                    <p className="text-muted-foreground">
                      {existingAd.duration_seconds}s · {existingAd.play_count} diffusions · {existingAd.is_active ? "Active" : "Inactive"}
                    </p>
                  </div>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {r.media_type === "video" && !existingAd && (
                  <Button size="sm" onClick={() => approveReuseMedia(r)}>
                    <PlayCircle className="w-3 h-3 mr-1" /> Utiliser cette vidéo comme pub
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setUploadDialog({ event_type: r.event_type, event_id: r.event_id })}
                >
                  <Upload className="w-3 h-3 mr-1" />
                  {existingAd ? "Remplacer par une autre vidéo" : "Téléverser une autre vidéo"}
                </Button>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );

  const filterBy = (mode: "pending" | "approved" | "rejected" | "all") => {
    if (mode === "pending") return requests.filter(r => r.status === "pending" || r.status === "paid" || r.status === "awaiting_payment");
    if (mode === "approved") return requests.filter(r => r.status === "approved");
    if (mode === "rejected") return requests.filter(r => r.status === "rejected" || r.status === "cancelled");
    return requests;
  };

  return (
    <div className="space-y-6">
      <SponsorPriceTiersManager />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Megaphone className="w-5 h-5" /> Demandes de sponsoring
            {pendingCount > 0 && <Badge className="bg-yellow-500 text-black">{pendingCount} en attente</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading && <Loader2 className="w-5 h-5 animate-spin mx-auto" />}
          {!loading && (
            <Tabs defaultValue="pending">
              <TabsList className="grid grid-cols-4 w-full">
                <TabsTrigger value="pending" className="text-xs">
                  En attente {pendingCount > 0 && <Badge className="ml-1 h-4 px-1 text-xs">{pendingCount}</Badge>}
                </TabsTrigger>
                <TabsTrigger value="approved" className="text-xs">Approuvées</TabsTrigger>
                <TabsTrigger value="rejected" className="text-xs">Rejetées</TabsTrigger>
                <TabsTrigger value="all" className="text-xs">Toutes</TabsTrigger>
              </TabsList>
              {(["pending","approved","rejected","all"] as const).map(mode => {
                const list = filterBy(mode);
                return (
                  <TabsContent key={mode} value={mode} className="mt-3">
                    {list.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">Aucune demande.</p>
                    ) : (
                      <ScrollArea className="h-[480px] pr-3">
                        <div className="space-y-3">{list.map(renderRequest)}</div>
                      </ScrollArea>
                    )}
                  </TabsContent>
                );
              })}
            </Tabs>
          )}
        </CardContent>
      </Card>


      <Card>
        <CardHeader><CardTitle>Vidéos finales de publicité</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {ads.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Aucune vidéo finale.</p>}
          {ads.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-3 p-3 border rounded-lg">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{a.title}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline">{a.event_type}</Badge>
                  <span><Eye className="w-3 h-3 inline" /> {a.play_count} diffusions</span>
                  <span>{a.duration_seconds}s</span>
                </div>
              </div>
              <Switch checked={a.is_active} onCheckedChange={(v) => toggleActive(a.id, v)} />
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={!!priceDialog} onOpenChange={(o) => !o && setPriceDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Fixer le prix du sponsoring</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">
            Le prix par défaut est calculé automatiquement à partir de la durée de la pub (voir « Tarifs sponsors par durée »). Tu peux le modifier ici pour cet évènement.
          </p>
          <Label>Prix (en crédits)</Label>
          <Input type="number" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="100" />
          <Button onClick={setPriceConfirm} disabled={working}>
            {working ? <Loader2 className="w-4 h-4 animate-spin" /> : "Envoyer la demande de paiement"}
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={!!uploadDialog} onOpenChange={(o) => !o && setUploadDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Téléverser une vidéo finale</DialogTitle></DialogHeader>
          <Label>Titre</Label>
          <Input value={adTitle} onChange={(e) => setAdTitle(e.target.value)} />
          <Label>Vidéo</Label>
          <Input type="file" accept="video/*" onChange={(e) => setAdFile(e.target.files?.[0] || null)} />
          <Label>Durée (secondes)</Label>
          <Input type="number" value={adDuration} onChange={(e) => setAdDuration(e.target.value)} />
          <Button onClick={uploadAd} disabled={working}>
            {working ? <Loader2 className="w-4 h-4 animate-spin" /> : "Téléverser"}
          </Button>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!reuseConfirm} onOpenChange={(o) => !o && !working && setReuseConfirm(null)}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <div className="w-14 h-14 rounded-full bg-gradient-primary flex items-center justify-center mx-auto mb-2">
              <PlayCircle className="w-7 h-7 text-primary-foreground" />
            </div>
            <AlertDialogTitle className="text-center text-xl font-bold bg-gradient-primary bg-clip-text text-transparent">
              Valider la vidéo telle quelle
            </AlertDialogTitle>
            <AlertDialogDescription className="text-center text-base pt-2">
              Cette vidéo sera publiée directement comme publicité finale, sans nouveau téléversement. Confirmez-vous qu'elle respecte les normes ?
            </AlertDialogDescription>
          </AlertDialogHeader>
          {reuseConfirm?.media_url && (
            <video
              src={reuseConfirm.media_url}
              controls
              className="w-full rounded-lg max-h-64 bg-black"
            />
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={working}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={working}
              onClick={(e) => { e.preventDefault(); confirmReuseMedia(); }}
              className="bg-gradient-primary hover:shadow-glow"
            >
              {working ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
              Approuver la vidéo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminSponsorManager;
