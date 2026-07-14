/**
 * Page: CompetitionManagement — tableau de bord manager pour créer
 * et suivre ses compétitions.
 *
 * EN — Manager dashboard to create and track owned competitions.
 *
 * @access role=manager
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEO from "@/components/seo/SEO";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { myCompetitions } from "@/api/endpoints/competitions";
import CompetitionForm from "@/components/competition/CompetitionForm";
import { Plus } from "lucide-react";

const CompetitionManagement = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { user, roles, ready } = useAuth();
  const isManager = roles.includes("manager");
  const [showForm, setShowForm] = useState(false);
  const [list, setList] = useState<any[]>([]);

  const load = async () => {
    try {
      const data = await myCompetitions();
      setList(data as any[]);
    } catch {
      setList([]);
    }
  };

  useEffect(() => {
    if (!ready) return;
    if (!user) { navigate("/auth"); return; }
    if (isManager) load();
  }, [ready, user, isManager, navigate]);

  if (!user) return null;

  if (!isManager) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container py-10 text-center">
          <p>{t("compManagerOnly")}</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <SEO title={`${t("compManagement")} — Synergy Network`} description={t("compManagement")} />
      <Header />
      <main className="container py-6 space-y-4 max-w-4xl">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">{t("compManagement")}</h1>
          <Button onClick={() => setShowForm((v) => !v)}>
            <Plus className="w-4 h-4 mr-1" /> {t("compNew")}
          </Button>
        </div>

        {showForm && (
          <CompetitionForm
            managerId={user.id}
            onSaved={() => { setShowForm(false); load(); }}
          />
        )}

        {!list.length ? (
          <p className="text-muted-foreground">{t("compNoCompetitions")}</p>
        ) : (
          <div className="space-y-2">
            {list.map((c) => (
              <Card key={c.id} className="cursor-pointer hover:border-primary/50"
                onClick={() => navigate(`/competition/${c.id}`)}>
                <CardContent className="p-3 flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{c.title}</p>
                    <p className="text-xs text-muted-foreground">{c.mode === "online" ? t("compOnline") : t("compOnsite")}</p>
                  </div>
                  <Badge variant={c.status === "live" ? "destructive" : "secondary"}>
                    {t("compStatus" + c.status.charAt(0).toUpperCase() + c.status.slice(1))}
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
};

export default CompetitionManagement;
