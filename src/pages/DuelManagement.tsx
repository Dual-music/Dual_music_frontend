import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { createDuel, listDuels } from "@/api/endpoints/duels";
import { listArtists } from "@/api/endpoints/creators";
import { createReplay, listReplays, deleteReplay } from "@/api/endpoints/replays";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Calendar, Video, Upload, Search } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/contexts/LanguageContext";
import { useUiPreferences } from "@/hooks/useUiPreferences";
import { formatTz, toWireUtc } from "@/lib/datetime";
import { SponsorDeadlineControl } from "@/components/sponsor/SponsorDeadlineControl";

const DuelManagement = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { language } = useLanguage();
  const { prefs } = useUiPreferences();
  const tz = prefs.timezone;
  const { user, roles, isAdmin, ready } = useAuth();
  const [loading, setLoading] = useState(true);
  const [canManage, setCanManage] = useState(false);
  const [artists, setArtists] = useState<any[]>([]);
  const [filteredArtists, setFilteredArtists] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [endedDuels, setEndedDuels] = useState<any[]>([]);
  const [upcomingDuels, setUpcomingDuels] = useState<any[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    artist1_id: "",
    artist2_id: "",
    scheduled_time: "",
    room_id: "",
    admin_role: "manager" as "manager" | "self",
  });

  useEffect(() => {
    checkAccess();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, user, roles]);

  useEffect(() => {
    if (searchQuery.trim()) {
      const filtered = artists.filter(artist => 
        artist.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        artist.stage_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        artist.email?.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredArtists(filtered);
    } else {
      setFilteredArtists(artists);
    }
  }, [searchQuery, artists]);

  const checkAccess = async () => {
    if (!ready) return;
    try {
      if (!user) {
        navigate("/auth");
        return;
      }

      setCurrentUserId(user.id);

      const hasAccess = roles.includes("admin") || roles.includes("manager");

      if (!hasAccess) {
        toast({
          title: "Accès refusé",
          description: "Vous n'avez pas les permissions nécessaires.",
          variant: "destructive",
        });
        navigate("/");
        return;
      }

      setCanManage(true);
      await Promise.all([loadArtists(), loadEndedDuels(user.id), loadUpcomingDuels(user.id)]);
    } catch (error) {
      console.error("Error checking access:", error);
      navigate("/");
    } finally {
      setLoading(false);
    }
  };

  const loadArtists = async () => {
    try {
      // `listArtists()` returns each artist with hydrated full_name/avatar_url
      // plus the artist_profile columns (incl. stage_name). The duel-participant
      // id is the user_id.
      const rows = (await listArtists()) as any[];
      const enrichedArtists = (rows || []).map((a: any) => ({
        ...a,
        id: a.user_id,
        stage_name: a.stage_name,
      }));
      setArtists(enrichedArtists);
      setFilteredArtists(enrichedArtists);
    } catch (error) {
      console.error("Error loading artists:", error);
    }
  };

  const loadUpcomingDuels = async (userId: string) => {
    // Manager-scoped via the backend `managerId` filter — rows are hydrated
    // with .artist1/.artist2 display profiles.
    const mine = (await listDuels({ status: "upcoming", managerId: userId, limit: 200 })) as any[] || [];
    setUpcomingDuels(mine.map((d) => ({
      ...d,
      artist1_name: d.artist1?.full_name || "Artiste 1",
      artist2_name: d.artist2?.full_name || "Artiste 2",
    })));
  };

  const loadEndedDuels = async (userId: string) => {
    try {
      // Manager-scoped via the backend `managerId` filter.
      const mine = (await listDuels({ status: "ended", managerId: userId, limit: 200 })) as any[] || [];
      const replays = mine.length
        ? ((await listReplays({ duelIds: mine.map((d) => d.id).join(",") })) as any[])
        : [];
      const enrichedDuels = mine.map((duel) => ({
        ...duel,
        artist1_name: duel.artist1?.full_name || "Artiste 1",
        artist2_name: duel.artist2?.full_name || "Artiste 2",
        hasReplay: replays?.some((r) => r.duel_id === duel.id),
      }));
      setEndedDuels(enrichedDuels);
    } catch (error) {
      console.error("Error loading ended duels:", error);
    }
  };

  const handleCreateDuel = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.artist1_id || !formData.artist2_id) {
      toast({
        title: "Erreur",
        description: "Veuillez sélectionner deux artistes.",
        variant: "destructive",
      });
      return;
    }

    if (formData.artist1_id === formData.artist2_id) {
      toast({
        title: "Erreur",
        description: "Veuillez sélectionner deux artistes différents.",
        variant: "destructive",
      });
      return;
    }

    try {
      const managerId = isAdmin && formData.admin_role === "self" ? null : user?.id;
      await createDuel({
        artist1_id: formData.artist1_id,
        artist2_id: formData.artist2_id,
        scheduled_time: toWireUtc(formData.scheduled_time, tz),
        room_id: formData.room_id || null,
        manager_id: managerId,
        status: "upcoming"
      });

      toast({
        title: "Succès",
        description: "Le duel a été créé avec succès.",
      });

      setFormData({
        artist1_id: "",
        artist2_id: "",
        scheduled_time: "",
        room_id: "",
        admin_role: "manager",
      });

      setTimeout(() => navigate("/duels"), 1500);
    } catch (error) {
      console.error("Error creating duel:", error);
      toast({
        title: "Erreur",
        description: "Impossible de créer le duel.",
        variant: "destructive",
      });
    }
  };

  const handlePublishReplay = async (duelId: string, publish: boolean) => {
    if (publish) {
      const duel = endedDuels.find(d => d.id === duelId);
      if (!duel) return;

      try {
        await createReplay({
          duel_id: duelId,
          title: `Duel: ${duel.artist1_name} vs ${duel.artist2_name}`,
          description: `Replay du duel entre ${duel.artist1_name} et ${duel.artist2_name}`,
          video_url: duel.room_id ? `https://stream.example.com/replay/${duel.room_id}` : "",
          duration: "00:00",
          recorded_date: duel.ended_at || new Date().toISOString(),
          is_premium: false
        });
        toast({ title: "Succès", description: "Le replay a été mis en ligne." });
        if (currentUserId) loadEndedDuels(currentUserId);
      } catch {
        toast({ title: "Erreur", description: "Impossible de publier le replay.", variant: "destructive" });
      }
    } else {
      try {
        const existing = (await listReplays({ duelIds: duelId })) as any[];
        await Promise.all((existing || []).map((r: any) => deleteReplay(r.id)));
        toast({ title: "Succès", description: "Le replay a été retiré." });
        if (currentUserId) loadEndedDuels(currentUserId);
      } catch {
        toast({ title: "Erreur", description: "Impossible de retirer le replay.", variant: "destructive" });
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-lg">Chargement...</p>
      </div>
    );
  }

  if (!canManage) {
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 pt-24 pb-12 px-4">
        <div className="container max-w-4xl mx-auto space-y-8">
          <div className="mb-8">
            <h1 className="text-4xl font-bold mb-2">Gestion des Duels</h1>
            <p className="text-muted-foreground">Créez et gérez les duels et replays</p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Créer un Nouveau Duel</CardTitle>
              <CardDescription>
                Sélectionnez les artistes et définissez les paramètres du duel
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Rechercher un artiste..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              <form onSubmit={handleCreateDuel} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="artist1">Artiste 1</Label>
                  <Select
                    value={formData.artist1_id}
                    onValueChange={(value) => setFormData({ ...formData, artist1_id: value })}
                  >
                    <SelectTrigger id="artist1">
                      <SelectValue placeholder="Sélectionnez le premier artiste" />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredArtists.map((artist) => (
                        <SelectItem key={artist.id} value={artist.id}>
                          {artist.stage_name || artist.full_name || artist.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="artist2">Artiste 2</Label>
                  <Select
                    value={formData.artist2_id}
                    onValueChange={(value) => setFormData({ ...formData, artist2_id: value })}
                  >
                    <SelectTrigger id="artist2">
                      <SelectValue placeholder="Sélectionnez le deuxième artiste" />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredArtists.map((artist) => (
                        <SelectItem key={artist.id} value={artist.id}>
                          {artist.stage_name || artist.full_name || artist.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="scheduled_time">Date et heure (optionnel)</Label>
                  <div className="flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-muted-foreground" />
                    <Input
                      id="scheduled_time"
                      type="datetime-local"
                      value={formData.scheduled_time}
                      onChange={(e) => setFormData({ ...formData, scheduled_time: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="room_id">ID de la salle (optionnel)</Label>
                  <Input
                    id="room_id"
                    placeholder="Entrez l'ID de la salle de streaming"
                    value={formData.room_id}
                    onChange={(e) => setFormData({ ...formData, room_id: e.target.value })}
                  />
                </div>

                {/* Admin role choice */}
                {isAdmin && (
                  <div className="space-y-2">
                    <Label>Votre rôle dans ce duel</Label>
                    <Select
                      value={formData.admin_role}
                      onValueChange={(value: "manager" | "self") => setFormData({ ...formData, admin_role: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="manager">Manager (arbitre du duel)</SelectItem>
                        <SelectItem value="self">Administrateur (sans rôle de manager)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {formData.admin_role === "manager" 
                        ? "Vous serez assigné comme manager/arbitre du duel" 
                        : "Aucun manager ne sera assigné automatiquement"}
                    </p>
                  </div>
                )}

                <div className="flex gap-4">
                  <Button type="submit" className="flex-1">
                    Créer le Duel
                  </Button>
                  <Button type="button" variant="outline" onClick={() => navigate(-1)}>
                    Annuler
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {upcomingDuels.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="w-5 h-5" />
                  Duels à venir — Sponsors
                </CardTitle>
                <CardDescription>
                  Fixez une date limite pour clôturer les demandes de sponsoring de chaque duel.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {upcomingDuels.map((duel) => (
                  <div key={duel.id} className="p-3 bg-muted/40 rounded-lg space-y-2">
                    <p className="font-semibold text-sm">
                      {duel.artist1_name} vs {duel.artist2_name}
                    </p>
                    {duel.scheduled_time && (
                      <p className="text-xs text-muted-foreground">
                        {formatTz(duel.scheduled_time, "PPp", { timezone: tz, language })}
                      </p>
                    )}
                    <SponsorDeadlineControl
                      table="duels"
                      rowId={duel.id}
                      currentValue={duel.sponsor_submission_deadline}
                      onSaved={(iso) => setUpcomingDuels((prev) => prev.map((x) => x.id === duel.id ? { ...x, sponsor_submission_deadline: iso } : x))}
                    />
                  </div>
                ))}
              </CardContent>
            </Card>
          )}


          {endedDuels.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Video className="w-5 h-5" />
                  Gestion des Replays
                </CardTitle>
                <CardDescription>
                  Publiez ou retirez les replays des duels terminés
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {endedDuels.map((duel) => (
                    <div key={duel.id} className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                      <div>
                        <p className="font-semibold">
                          {duel.artist1_name} vs {duel.artist2_name}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {formatTz(duel.ended_at, "d MMM yyyy", { timezone: tz, language })}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant={duel.hasReplay ? "default" : "secondary"}>
                          {duel.hasReplay ? "En ligne" : "Hors ligne"}
                        </Badge>
                        <div className="flex items-center gap-2">
                          <Label htmlFor={`replay-${duel.id}`} className="text-sm">
                            Publier
                          </Label>
                          <Switch
                            id={`replay-${duel.id}`}
                            checked={duel.hasReplay}
                            onCheckedChange={(checked) => handlePublishReplay(duel.id, checked)}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Instructions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>• Sélectionnez deux artistes différents pour organiser un duel.</p>
              <p>• Utilisez la barre de recherche pour trouver rapidement un artiste.</p>
              <p>• Après un duel, vous pouvez choisir de publier ou non le replay.</p>
              <p>• Les artistes sélectionnés recevront une notification pour le duel.</p>
            </CardContent>
          </Card>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default DuelManagement;