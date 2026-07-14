/**
 * Admin: AdminCompetitionsManager — vue de modération des compétitions.
 *
 * Liste toutes les compétitions de la plateforme, statut, manager, candidats
 * approuvés, billets vendus. Permet d'annuler une compétition ou d'en forcer
 * la finalisation via la RPC `finalize_competition_ranking`.
 *
 * EN — Admin moderation table for competitions, with cancel & finalize.
 *
 * @access role=admin
 * @see    finalize_competition_ranking
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listCompetitions, updateCompetition, finalize as finalizeCompetition } from "@/api/endpoints/competitions";
import { ApiError } from "@/api/http";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AdminTable } from "@/components/admin/AdminTable";
import { useToast } from "@/hooks/use-toast";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { useLanguage } from "@/contexts/LanguageContext";
import { Eye, Trophy, XCircle } from "lucide-react";

const AdminCompetitionsManager = () => {
  const { t } = useLanguage();
  const { toast } = useToast();
  const { confirm, dialog } = useConfirmDialog();
  const navigate = useNavigate();
  const [list, setList] = useState<any[]>([]);

  const load = async () => {
    try {
      const data = await listCompetitions({ limit: 100 });
      setList(data as any[]);
    } catch {
      setList([]);
    }
  };

  useEffect(() => { load(); }, []);

  const cancel = (id: string) => {
    confirm({
      title: t("adminCancel"),
      description: t("adminCancel") + " ?",
      variant: "destructive",
      onConfirm: async () => {
        try {
          await updateCompetition(id, { status: "cancelled" });
        } catch (err) {
          toast({ title: err instanceof ApiError ? err.message : "Error", variant: "destructive" });
          return;
        }
        toast({ title: "OK" });
        load();
      },
    });
  };


  const finalize = async (id: string) => {
    try {
      await finalizeCompetition(id);
    } catch (err) {
      toast({ title: err instanceof ApiError ? err.message : "Error", variant: "destructive" });
      return;
    }
    toast({ title: t("compFinalized") });
    load();
  };

  return (
    <>
    {dialog}
    <Card>
      <CardHeader>
        <CardTitle>{t("adminCompetitionsTitle")}</CardTitle>
        <CardDescription>{t("adminCompetitionsDesc")}</CardDescription>
      </CardHeader>
      <CardContent>
        <AdminTable
          data={list}
          searchKeys={["title", "status", "mode"]}
          emptyMessage={t("adminNoCompetition")}
          columns={[
            { key: "title", label: t("adminColTitle"), sortable: true },
            {
              key: "mode", label: t("compMode"), sortable: true,
              render: (c: any) => <Badge variant="outline">{t(c.mode === "online" ? "compOnline" : "compOnsite")}</Badge>,
            },
            {
              key: "status", label: t("adminColStatus"), sortable: true,
              render: (c: any) => (
                <Badge variant={c.status === "live" ? "destructive" : "secondary"}>
                  {t("compStatus" + c.status.charAt(0).toUpperCase() + c.status.slice(1))}
                </Badge>
              ),
            },
            {
              key: "actions", label: t("adminColActions"),
              render: (c: any) => (
                <div className="flex gap-1.5">
                  <Button size="sm" variant="outline" onClick={() => navigate(`/competition/${c.id}`)}>
                    <Eye className="w-4 h-4" />
                  </Button>
                  {c.status === "live" && (
                    <Button size="sm" variant="default" onClick={() => finalize(c.id)}>
                      <Trophy className="w-4 h-4 mr-1" /> {t("compFinalize")}
                    </Button>
                  )}
                  {!["finished", "cancelled"].includes(c.status) && (
                    <Button size="sm" variant="destructive" onClick={() => cancel(c.id)}>
                      <XCircle className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ),
            },
          ]}
        />
      </CardContent>
    </Card>
    </>
  );
};

export default AdminCompetitionsManager;
