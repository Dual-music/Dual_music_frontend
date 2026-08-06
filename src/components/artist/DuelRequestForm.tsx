/**
 * Formulaire demande duel : artiste cible, date, manager assigné. Insert `duel_requests`,
 * validation admin (assignation exclusive manager).
 */
import { useState, useEffect } from "react";
import { myDuelRequests, createDuelRequest, respondDuelRequest } from "@/api/endpoints/duels";
import * as creators from "@/api/endpoints/creators";
import { getDisplayProfiles } from "@/api/endpoints/users";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Swords, Search, Send, Check, X, Clock } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useUiPreferences } from "@/hooks/useUiPreferences";
import { formatTz, toWireUtc } from "@/lib/datetime";

interface DuelRequestFormProps { userId: string; }

interface Artist { id: string; full_name: string; avatar_url: string | null; }

interface DuelRequest {
  id: string; requester_id: string; opponent_id: string; status: string;
  proposed_date: string | null; message: string | null; created_at: string;
  opponent?: Artist; requester?: Artist;
}

export const DuelRequestForm = ({ userId }: DuelRequestFormProps) => {
  const { t, language } = useLanguage();
  const { prefs } = useUiPreferences();
  const tz = prefs.timezone;
  const fmtDt = (d: string) => formatTz(d, "dd MMM yyyy HH:mm", { timezone: tz, language });
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [artists, setArtists] = useState<Artist[]>([]);
  const [selectedArtist, setSelectedArtist] = useState<Artist | null>(null);
  const [proposedDate, setProposedDate] = useState("");
  const [message, setMessage] = useState("");
  const [myRequests, setMyRequests] = useState<DuelRequest[]>([]);
  const [receivedRequests, setReceivedRequests] = useState<DuelRequest[]>([]);
  const [sending, setSending] = useState(false);

  useEffect(() => { loadRequests(); }, [userId]);

  const loadRequests = async () => {
    try {
      const all = (await myDuelRequests()) as any[];
      const sent = all.filter((r) => r.requester_id === userId);
      const received = all.filter((r) => r.opponent_id === userId);

      const ids = [...new Set([
        ...sent.map((r) => r.opponent_id),
        ...received.map((r) => r.requester_id),
      ])];
      const profiles = await getDisplayProfiles(ids);
      const profileMap = new Map(profiles.map((p) => [p.id, p]));

      setMyRequests(sent.map((r) => ({ ...r, opponent: profileMap.get(r.opponent_id) as Artist })));
      setReceivedRequests(received.map((r) => ({ ...r, requester: profileMap.get(r.requester_id) as Artist })));
    } catch (error) {
      console.error("Error loading requests:", error);
    } finally {
      setLoading(false);
    }
  };

  const searchArtists = async (query?: string) => {
    const searchText = query ?? searchQuery;
    try {
      const artistProfiles = (await creators.listArtists({ limit: 100 })) as any[];

      let mapped = artistProfiles.filter(ap => ap.user_id !== userId).map(ap => ({
        id: ap.user_id, full_name: ap.stage_name || "Artiste", avatar_url: ap.avatar_url
      }));

      if (searchText.trim()) {
        const lower = searchText.toLowerCase();
        mapped = mapped.filter(a => a.full_name?.toLowerCase().includes(lower));
      }
      setArtists(mapped.slice(0, 10));
    } catch (error) { setArtists([]); }
  };

  useEffect(() => { searchArtists(""); }, [userId]);

  const handleSendRequest = async () => {
    if (!selectedArtist) return;
    setSending(true);
    try {
      await createDuelRequest({
        opponentId: selectedArtist.id,
        proposedDate: toWireUtc(proposedDate, tz),
        message: message.trim() || null,
      });
      // Notifications are emitted server-side.

      toast({ title: t("duelReqSent"), description: `${t("duelReqSent")} → ${selectedArtist.full_name}` });
      setSelectedArtist(null); setProposedDate(""); setMessage(""); setSearchQuery(""); setArtists([]); loadRequests();
    } catch (error: any) {
      toast({ title: t("commonError"), description: error.message, variant: "destructive" });
    } finally { setSending(false); }
  };

  const handleRespondRequest = async (requestId: string, accept: boolean) => {
    try {
      await respondDuelRequest(requestId, { accept });
      // Requester + admin notifications are emitted server-side.

      toast({
        title: accept ? t("duelReqAccepted") : t("duelReqRefused"),
        description: accept ? t("duelReqAcceptedDesc") : t("duelReqRefusedDesc"),
      });
      loadRequests();
    } catch (error: any) {
      toast({ title: t("commonError"), description: error.message, variant: "destructive" });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending": return <Badge variant="outline" className="border-yellow-500 text-yellow-500"><Clock className="w-3 h-3 mr-1" />{t("duelReqStatusPending")}</Badge>;
      case "accepted": case "admin_pending": return <Badge variant="outline" className="border-blue-500 text-blue-500"><Clock className="w-3 h-3 mr-1" />{t("duelReqStatusAdminPending")}</Badge>;
      case "approved": return <Badge className="bg-green-500"><Check className="w-3 h-3 mr-1" />{t("duelReqStatusApproved")}</Badge>;
      case "rejected": return <Badge variant="destructive"><X className="w-3 h-3 mr-1" />{t("duelReqStatusRejected")}</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  if (loading) return <div className="text-center py-8">{t("commonLoading")}</div>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Swords className="w-5 h-5" />{t("duelReqTitle")}</CardTitle>
          <CardDescription>{t("duelReqDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); searchArtists(e.target.value); }} placeholder={t("duelReqSearchPlaceholder")} />
            <Button variant="outline" onClick={() => searchArtists()}><Search className="w-4 h-4" /></Button>
          </div>
          <div className="text-sm text-muted-foreground">
            {artists.length > 0 ? `${artists.length} ${t("duelReqAvailable")}` : t("duelReqNone")}
          </div>

          {artists.length > 0 && (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {artists.map((artist) => (
                <div key={artist.id} className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${selectedArtist?.id === artist.id ? "bg-primary/10 border border-primary" : "bg-muted/50 hover:bg-muted"}`} onClick={() => setSelectedArtist(artist)}>
                  <Avatar><AvatarImage src={artist.avatar_url || ""} /><AvatarFallback>{artist.full_name?.charAt(0) || "A"}</AvatarFallback></Avatar>
                  <span className="font-medium">{artist.full_name}</span>
                </div>
              ))}
            </div>
          )}

          {selectedArtist && (
            <div className="space-y-4 pt-4 border-t">
              <div className="flex items-center gap-3 p-3 bg-primary/5 rounded-lg">
                <Avatar><AvatarImage src={selectedArtist.avatar_url || ""} /><AvatarFallback>{selectedArtist.full_name?.charAt(0) || "A"}</AvatarFallback></Avatar>
                <div>
                  <p className="font-medium">{selectedArtist.full_name}</p>
                  <p className="text-sm text-muted-foreground">{t("duelReqSelected")}</p>
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t("duelReqDateLabel")}</Label>
                <Input type="datetime-local" value={proposedDate} onChange={(e) => setProposedDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t("duelReqMessageLabel")}</Label>
                <Textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder={t("duelReqMessagePlaceholder")} />
              </div>
              <Button onClick={handleSendRequest} disabled={sending} className="w-full">
                <Send className="w-4 h-4 mr-2" />{sending ? t("duelReqSending") : t("duelReqSendBtn")}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {receivedRequests.length > 0 && (
        <Card>
          <CardHeader><CardTitle>{t("duelReqReceived")}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {receivedRequests.map((request) => (
              <div key={request.id} className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <Avatar><AvatarImage src={request.requester?.avatar_url || ""} /><AvatarFallback>{request.requester?.full_name?.charAt(0) || "?"}</AvatarFallback></Avatar>
                  <div>
                    <p className="font-medium">{request.requester?.full_name || "Artiste"}</p>
                    {request.message && <p className="text-sm text-muted-foreground">{request.message}</p>}
                    <p className="text-xs text-muted-foreground">{fmtDt(request.created_at)}</p>
                    {request.proposed_date && (
                      <p className="text-xs text-primary flex items-center gap-1"><Clock className="w-3 h-3" />{t("duelReqPlanned")} {fmtDt(request.proposed_date)}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {request.status === "pending" ? (
                    <>
                      <Button size="sm" variant="outline" onClick={() => handleRespondRequest(request.id, false)}><X className="w-4 h-4" /></Button>
                      <Button size="sm" onClick={() => handleRespondRequest(request.id, true)}><Check className="w-4 h-4" /></Button>
                    </>
                  ) : getStatusBadge(request.status)}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {myRequests.length > 0 && (
        <Card>
          <CardHeader><CardTitle>{t("duelReqMySent")}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {myRequests.map((request) => (
              <div key={request.id} className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <Avatar><AvatarImage src={request.opponent?.avatar_url || ""} /><AvatarFallback>{request.opponent?.full_name?.charAt(0) || "?"}</AvatarFallback></Avatar>
                  <div>
                    <p className="font-medium">{request.opponent?.full_name || "Artiste"}</p>
                    <p className="text-xs text-muted-foreground">{fmtDt(request.created_at)}</p>
                    {request.proposed_date && (
                      <p className="text-xs text-primary flex items-center gap-1"><Clock className="w-3 h-3" />{t("duelReqPlanned")} {fmtDt(request.proposed_date)}</p>
                    )}
                  </div>
                </div>
                {getStatusBadge(request.status)}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
};