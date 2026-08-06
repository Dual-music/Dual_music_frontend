/**
 * Gestionnaire concerts artiste : création, planification, modification, suppression.
 * Insert/update sur `concerts`, validation par admin (`AdminConcertValidation`), notifications
 * via `notify-concert-start` edge function.
 */
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import * as concertsApi from "@/api/endpoints/concerts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Calendar, Ticket, DollarSign, Users, Video, Play, Trash2, Edit } from "lucide-react";
import { ImageUpload } from "@/components/ui/image-upload";
import { useLanguage } from "@/contexts/LanguageContext";
import { useUiPreferences } from "@/hooks/useUiPreferences";
import { formatTz, toTzInputValue, toWireUtc } from "@/lib/datetime";
import { SponsorDeadlineControl } from "@/components/sponsor/SponsorDeadlineControl";

interface ArtistConcertManagerProps {
  userId: string;
}

interface Concert {
  id: string;
  title: string;
  description: string | null;
  scheduled_date: string;
  ticket_price: number;
  max_tickets: number | null;
  tickets_sold: number;
  revenue: number;
  status: string;
  stream_url: string | null;
  cover_image_url: string | null;
  approval_status?: string;
  allows_dedications?: boolean;
  allows_sponsor_ads?: boolean;
}

export const ArtistConcertManager = ({ userId }: ArtistConcertManagerProps) => {
  const { t, language } = useLanguage();
  const { prefs } = useUiPreferences();
  const tz = prefs.timezone;
  const { toast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [concerts, setConcerts] = useState<Concert[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingConcert, setEditingConcert] = useState<Concert | null>(null);
  
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    scheduled_date: "",
    ticket_price: "",
    max_tickets: "",
    cover_image_url: "",
    stream_url: "",
    allows_dedications: true,
    allows_sponsor_ads: true,
  });

  useEffect(() => {
    loadConcerts();
  }, [userId]);

  const loadConcerts = async () => {
    try {
      const data = await concertsApi.myArtistConcerts();
      setConcerts((data as any) || []);
    } catch (error) {
      console.error("Error loading concerts:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.title || !formData.scheduled_date) {
      toast({
        title: t("commonError"),
        description: t("artConcertRequiredFields"),
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title: formData.title,
        description: formData.description || null,
        scheduledDate: toWireUtc(formData.scheduled_date, tz),
        ticketPrice: parseFloat(formData.ticket_price) || 0,
        maxTickets: formData.max_tickets ? parseInt(formData.max_tickets) : null,
        coverImageUrl: formData.cover_image_url || null,
        allowsDedications: formData.allows_dedications,
        allowsSponsorAds: formData.allows_sponsor_ads,
      };

      if (editingConcert) {
        await concertsApi.updateArtistConcert(editingConcert.id, payload);
        toast({
          title: t("artConcertUpdated"),
          description: t("artConcertUpdatedDesc"),
        });
      } else {
        await concertsApi.createArtistConcert(payload);
        toast({
          title: t("artConcertCreated"),
          description: t("artConcertCreatedDesc"),
        });
      }

      setFormData({ title: "", description: "", scheduled_date: "", ticket_price: "", max_tickets: "", cover_image_url: "", stream_url: "", allows_dedications: true, allows_sponsor_ads: true });
      setEditingConcert(null);
      setIsDialogOpen(false);
      loadConcerts();
    } catch (error: any) {
      toast({ title: t("commonError"), description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const deleteConcert = async (concertId: string) => {
    if (!confirm(t("artConcertDeleteConfirm"))) return;
    
    try {
      await concertsApi.deleteArtistConcert(concertId);
      toast({ title: t("artConcertDeleted"), description: t("artConcertDeletedDesc") });
      loadConcerts();
    } catch (error: any) {
      toast({ title: t("commonError"), description: error.message, variant: "destructive" });
    }
  };

  const updateConcertStatus = async (concertId: string, status: string) => {
    try {
      await concertsApi.updateArtistConcert(concertId, { status });
      toast({ title: t("artConcertStatusUpdated"), description: `${status}` });
      loadConcerts();
    } catch (error: any) {
      toast({ title: t("commonError"), description: error.message, variant: "destructive" });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "upcoming":
        return <Badge variant="outline" className="border-blue-500 text-blue-500">{t("artConcertUpcoming")}</Badge>;
      case "live":
        return <Badge className="bg-red-500 animate-pulse">{t("artConcertLive")}</Badge>;
      case "ended":
        return <Badge variant="secondary">{t("artConcertEnded")}</Badge>;
      case "cancelled":
        return <Badge variant="destructive">{t("artConcertCancelled")}</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const totalRevenue = concerts.reduce((sum, c) => sum + Number(c.revenue), 0);
  const totalTicketsSold = concerts.reduce((sum, c) => sum + c.tickets_sold, 0);

  if (loading) {
    return <div className="text-center py-8">{t("commonLoading")}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">{t("artConcertTitle")}</h2>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" />{t("artConcertPlan")}</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{t("artConcertNewTitle")}</DialogTitle>
              <DialogDescription>{t("artConcertNewDesc")}</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="title">{t("artConcertTitleLabel")}</Label>
                  <Input id="title" value={formData.title} onChange={(e) => setFormData({...formData, title: e.target.value})} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="scheduled_date">{t("artConcertDateLabel")}</Label>
                  <Input id="scheduled_date" type="datetime-local" value={formData.scheduled_date} onChange={(e) => setFormData({...formData, scheduled_date: e.target.value})} required />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">{t("artConcertDescLabel")}</Label>
                <Textarea id="description" value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} placeholder={t("artConcertDescPlaceholder")} />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="ticket_price">{t("artConcertPriceLabel")}</Label>
                  <Input id="ticket_price" type="number" step="0.01" value={formData.ticket_price} onChange={(e) => setFormData({...formData, ticket_price: e.target.value})} placeholder={t("artConcertPricePlaceholder")} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="max_tickets">{t("artConcertMaxTickets")}</Label>
                  <Input id="max_tickets" type="number" value={formData.max_tickets} onChange={(e) => setFormData({...formData, max_tickets: e.target.value})} placeholder={t("artConcertMaxTicketsPlaceholder")} />
                </div>
              </div>

              <ImageUpload value={formData.cover_image_url} onChange={(url) => setFormData({...formData, cover_image_url: url})} label={t("artConcertCoverLabel")} folder="concerts" />

              <div className="space-y-2">
                <Label htmlFor="stream_url">{t("artConcertStreamLabel")}</Label>
                <Input id="stream_url" value={formData.stream_url} onChange={(e) => setFormData({...formData, stream_url: e.target.value})} placeholder={t("artConcertStreamPlaceholder")} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-lg border bg-muted/30">
                <label className="flex items-center justify-between gap-2 cursor-pointer">
                  <span className="text-sm">{t("artConcertAcceptDedications")}</span>
                  <input type="checkbox" checked={formData.allows_dedications}
                    onChange={(e) => setFormData({...formData, allows_dedications: e.target.checked})}
                    className="h-4 w-4" />
                </label>
                <label className="flex items-center justify-between gap-2 cursor-pointer">
                  <span className="text-sm">{t("artConcertAcceptAds")}</span>
                  <input type="checkbox" checked={formData.allows_sponsor_ads}
                    onChange={(e) => setFormData({...formData, allows_sponsor_ads: e.target.checked})}
                    className="h-4 w-4" />
                </label>
              </div>

              <Button type="submit" disabled={saving} className="w-full">
                {saving ? t("artConcertCreating") : t("artConcertCreate")}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-gradient-to-br from-blue-500/10 to-cyan-500/5 border-blue-500/20">
          <CardContent className="pt-6 text-center">
            <Calendar className="w-8 h-8 mx-auto mb-2 text-blue-500" />
            <p className="text-3xl font-bold">{concerts.length}</p>
            <p className="text-sm text-muted-foreground">{t("artConcertPlanned")}</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-green-500/10 to-emerald-500/5 border-green-500/20">
          <CardContent className="pt-6 text-center">
            <Users className="w-8 h-8 mx-auto mb-2 text-green-500" />
            <p className="text-3xl font-bold">{totalTicketsSold}</p>
            <p className="text-sm text-muted-foreground">{t("artConcertTicketsSold")}</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-purple-500/10 to-pink-500/5 border-purple-500/20">
          <CardContent className="pt-6 text-center">
            <DollarSign className="w-8 h-8 mx-auto mb-2 text-purple-500" />
            <p className="text-3xl font-bold">${totalRevenue.toFixed(2)}</p>
            <p className="text-sm text-muted-foreground">{t("artConcertTotalRevenue")}</p>
          </CardContent>
        </Card>
      </div>

      <div className="max-h-[70vh] overflow-y-auto pr-2 grid grid-cols-1 md:grid-cols-2 gap-6">
        {concerts.map((concert) => (
          <Card key={concert.id} className="overflow-hidden">
            {concert.cover_image_url && (
              <div className="h-40 bg-cover bg-center" style={{ backgroundImage: `url(${concert.cover_image_url})` }} />
            )}
            <CardHeader>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <CardTitle className="text-lg">{concert.title}</CardTitle>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {concert.approval_status === "pending" && (
                    <Badge variant="outline" className="border-amber-500 text-amber-500">{t("concertStatusPendingValidation")}</Badge>
                  )}
                  {concert.approval_status === "rejected" && (
                    <Badge variant="destructive">{t("concertStatusRejected")}</Badge>
                  )}
                  {getStatusBadge(concert.status)}
                </div>
              </div>
              <CardDescription>
                {formatTz(concert.scheduled_date, "EEEE d MMMM yyyy HH:mm", { timezone: tz, language })}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {concert.description && (
                <p className="text-sm text-muted-foreground line-clamp-2">{concert.description}</p>
              )}
              
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2 bg-muted/50 rounded">
                  <p className="text-lg font-bold">${concert.ticket_price}</p>
                  <p className="text-xs text-muted-foreground">{t("artConcertPrice")}</p>
                </div>
                <div className="p-2 bg-muted/50 rounded">
                  <p className="text-lg font-bold">{concert.tickets_sold}</p>
                  <p className="text-xs text-muted-foreground">{t("artConcertSold")}</p>
                </div>
                <div className="p-2 bg-muted/50 rounded">
                  <p className="text-lg font-bold">${Number(concert.revenue).toFixed(0)}</p>
                  <p className="text-xs text-muted-foreground">{t("artConcertRevenue")}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {concert.status === "upcoming" && (
                  <>
                    <Button size="sm" className="flex-1" onClick={() => navigate(`/concert/${concert.id}`)}>
                      <Play className="w-4 h-4 mr-1" />{t("artConcertStartLive")}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => {
                      setEditingConcert(concert);
                      setFormData({
                        title: concert.title,
                        description: concert.description || "",
                        scheduled_date: toTzInputValue(concert.scheduled_date, tz),
                        ticket_price: String(concert.ticket_price),
                        max_tickets: concert.max_tickets ? String(concert.max_tickets) : "",
                        cover_image_url: concert.cover_image_url || "",
                        stream_url: concert.stream_url || "",
                        allows_dedications: concert.allows_dedications ?? true,
                        allows_sponsor_ads: concert.allows_sponsor_ads ?? true,
                      });
                      setIsDialogOpen(true);
                    }}>
                      {t("artConcertEdit")}
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => deleteConcert(concert.id)}>
                      {t("artConcertDelete")}
                    </Button>
                  </>
                )}
                {concert.status === "live" && (
                  <>
                    <Button size="sm" className="flex-1" onClick={() => navigate(`/concert/${concert.id}`)}>
                      <Video className="w-4 h-4 mr-1" />{t("artConcertWatch")}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => updateConcertStatus(concert.id, "ended")}>
                      {t("artConcertEnd")}
                    </Button>
                  </>
                )}
              </div>
              {concert.status === "upcoming" && concert.allows_sponsor_ads && (
                <SponsorDeadlineControl
                  table="artist_concerts"
                  rowId={concert.id}
                  currentValue={(concert as any).sponsor_submission_deadline}
                  onSaved={(iso) => setConcerts((prev) => prev.map((x) => x.id === concert.id ? ({ ...x, sponsor_submission_deadline: iso } as any) : x))}
                />
              )}
            </CardContent>
          </Card>
        ))}
      </div>


      {concerts.length === 0 && (
        <Card className="p-8 text-center">
          <Video className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">{t("artConcertEmpty")}</p>
          <p className="text-sm text-muted-foreground mb-4">{t("artConcertEmptyDesc")}</p>
          <Button onClick={() => setIsDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />{t("artConcertPlan")}
          </Button>
        </Card>
      )}
    </div>
  );
};