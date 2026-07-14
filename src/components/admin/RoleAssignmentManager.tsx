/**
 * Admin: RoleAssignmentManager — gestion des accès aux rôles artiste/manager.
 *
 * Permet à l'administrateur :
 *  - d'activer / désactiver le formulaire public de demande "Devenir artiste"
 *    et "Devenir manager" (clés `artist_requests_enabled` /
 *    `manager_requests_enabled` dans `platform_settings`).
 *  - d'attribuer directement le rôle `artist` ou `manager` à un utilisateur
 *    existant (recherche par email ou nom complet), sans passer par la
 *    procédure de demande / validation.
 *
 * EN — Admin component to toggle public role-request forms and assign
 * `artist` / `manager` roles directly to any registered user.
 *
 * @access role=admin
 */
import { useEffect, useState } from "react";
import * as admin from "@/api/endpoints/admin";
import { updatePlatformSetting } from "@/hooks/usePlatformSettings";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { Search, UserPlus, Briefcase, Mic2 } from "lucide-react";

type SettingKey = "artist_requests_enabled" | "manager_requests_enabled";

interface ProfileRow {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
}

const RoleAssignmentManager = () => {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [artistOpen, setArtistOpen] = useState(true);
  const [managerOpen, setManagerOpen] = useState(true);
  const [loadingKey, setLoadingKey] = useState<SettingKey | null>(null);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<ProfileRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [rolesByUser, setRolesByUser] = useState<Record<string, string[]>>({});
  const [assigning, setAssigning] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        // These keys are not on the public allow-list → read the admin map.
        const settings = await admin.getSettings();
        const artist = settings["artist_requests_enabled"] as { enabled?: boolean } | undefined;
        const manager = settings["manager_requests_enabled"] as { enabled?: boolean } | undefined;
        if (artist) setArtistOpen(artist.enabled !== false);
        if (manager) setManagerOpen(manager.enabled !== false);
      } catch {
        /* keep defaults */
      }
    })();
  }, []);

  const toggleSetting = async (key: SettingKey, next: boolean) => {
    setLoadingKey(key);
    try {
      await updatePlatformSetting(key, { enabled: next });
      if (key === "artist_requests_enabled") setArtistOpen(next);
      if (key === "manager_requests_enabled") setManagerOpen(next);
      toast({ title: t("roleSettingSaved") || "Réglage enregistré" });
    } catch (e) {
      toast({ title: t("errorTitle") || "Erreur", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setLoadingKey(null);
    }
  };

  const runSearch = async () => {
    const q = search.trim();
    if (!q) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const rows = (await admin.searchUsers(q)) as unknown as ProfileRow[];
      setResults(rows);
      if (rows.length) {
        const ids = rows.map((r) => r.id);
        const roles = await admin.rolesBatch(ids);
        const map: Record<string, string[]> = {};
        roles.forEach((r) => {
          (map[r.user_id] ||= []).push(r.role);
        });
        setRolesByUser(map);
      }
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const assignRole = async (userId: string, role: "artist" | "manager") => {
    setAssigning(userId + role);
    try {
      // grantRole is idempotent server-side (find-or-create) and now also
      // ensures the artist_profiles / manager_profiles rows.
      await admin.grantRole({ userId, role });
      toast({ title: t("roleAssigned") || "Rôle attribué" });
      setRolesByUser((prev) => ({ ...prev, [userId]: Array.from(new Set([...(prev[userId] || []), role])) }));
    } catch (e) {
      toast({ title: t("errorTitle") || "Erreur", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setAssigning(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toggles */}
      <Card>
        <CardHeader>
          <CardTitle>{t("rolePublicRequestsTitle") || "Demandes publiques de rôle"}</CardTitle>
          <CardDescription>
            {t("rolePublicRequestsDesc") ||
              "Active ou désactive les formulaires permettant aux utilisateurs de demander à devenir artiste ou manager."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-3 rounded-lg border">
            <div className="flex items-center gap-3">
              <Mic2 className="w-5 h-5 text-primary" />
              <div>
                <p className="font-semibold">{t("roleArtistRequests") || "Demandes Artiste"}</p>
                <p className="text-xs text-muted-foreground">
                  {t("roleArtistRequestsDesc") || "Permettre aux utilisateurs de postuler comme artiste."}
                </p>
              </div>
            </div>
            <Switch
              checked={artistOpen}
              disabled={loadingKey === "artist_requests_enabled"}
              onCheckedChange={(v) => toggleSetting("artist_requests_enabled", v)}
            />
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg border">
            <div className="flex items-center gap-3">
              <Briefcase className="w-5 h-5 text-primary" />
              <div>
                <p className="font-semibold">{t("roleManagerRequests") || "Demandes Manager"}</p>
                <p className="text-xs text-muted-foreground">
                  {t("roleManagerRequestsDesc") || "Permettre aux utilisateurs de postuler comme manager."}
                </p>
              </div>
            </div>
            <Switch
              checked={managerOpen}
              disabled={loadingKey === "manager_requests_enabled"}
              onCheckedChange={(v) => toggleSetting("manager_requests_enabled", v)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Direct assignment */}
      <Card>
        <CardHeader>
          <CardTitle>{t("roleAssignDirectTitle") || "Attribution directe d'un rôle"}</CardTitle>
          <CardDescription>
            {t("roleAssignDirectDesc") ||
              "Attribuez le rôle artiste ou manager à un utilisateur sans procédure de validation."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder={t("roleAssignSearchPlaceholder") || "Rechercher par email ou nom..."}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runSearch()}
            />
            <Button onClick={runSearch} disabled={searching}>
              <Search className="w-4 h-4 mr-1" />
              {t("search") || "Rechercher"}
            </Button>
          </div>

          {results.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              {searching ? t("loading") : t("roleAssignNoResult") || "Aucun résultat. Lancez une recherche."}
            </p>
          ) : (
            <div className="space-y-2">
              {results.map((u) => {
                const userRoles = rolesByUser[u.id] || [];
                const isArtist = userRoles.includes("artist");
                const isManager = userRoles.includes("manager");
                return (
                  <div key={u.id} className="flex items-center justify-between p-3 rounded-lg border gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {u.avatar_url ? (
                        <img src={u.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                          <UserPlus className="w-5 h-5 text-muted-foreground" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="font-medium truncate">{u.full_name || "—"}</p>
                        <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                        <div className="flex gap-1 mt-1">
                          {userRoles.map((r) => (
                            <Badge key={r} variant="outline" className="text-[10px]">
                              {r}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant={isArtist ? "secondary" : "default"}
                        disabled={isArtist || assigning === u.id + "artist"}
                        onClick={() => assignRole(u.id, "artist")}
                      >
                        <Mic2 className="w-3 h-3 mr-1" />
                        {isArtist
                          ? t("roleAlreadyArtist") || "Artiste"
                          : t("roleMakeArtist") || "Artiste"}
                      </Button>
                      <Button
                        size="sm"
                        variant={isManager ? "secondary" : "default"}
                        disabled={isManager || assigning === u.id + "manager"}
                        onClick={() => assignRole(u.id, "manager")}
                      >
                        <Briefcase className="w-3 h-3 mr-1" />
                        {isManager
                          ? t("roleAlreadyManager") || "Manager"
                          : t("roleMakeManager") || "Manager"}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default RoleAssignmentManager;
