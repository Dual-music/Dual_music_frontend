/**
 * Admin: AdminDocumentsManager — accès rapide à la documentation interne.
 *
 * Liens vers `TechnicalDoc`, `ApiDocs`, `UserGuide`, `HelpCenter` et autres
 * ressources réservées aux administrateurs et développeurs.
 *
 * @access  role=admin
 */
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Code2, BookOpen, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";

const AdminDocumentsManager = () => {
  const { t } = useLanguage();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("admDocTitle")}</CardTitle>
        <CardDescription>{t("admDocDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link to="/api" className="block">
          <div className="p-5 rounded-xl border border-border hover:border-primary/50 hover:bg-accent/30 transition-colors">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-primary/10"><Code2 className="w-5 h-5 text-primary" /></div>
              <div className="flex-1">
                <p className="font-semibold flex items-center gap-1.5">{t("admDocApi")} <ExternalLink className="w-3.5 h-3.5 opacity-60" /></p>
                <p className="text-xs text-muted-foreground mt-1">{t("admDocApiDesc")}</p>
              </div>
            </div>
          </div>
        </Link>
        <Link to="/technical-doc" className="block">
          <div className="p-5 rounded-xl border border-border hover:border-primary/50 hover:bg-accent/30 transition-colors">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-primary/10"><BookOpen className="w-5 h-5 text-primary" /></div>
              <div className="flex-1">
                <p className="font-semibold flex items-center gap-1.5">{t("admDocTech")} <ExternalLink className="w-3.5 h-3.5 opacity-60" /></p>
                <p className="text-xs text-muted-foreground mt-1">{t("admDocTechDesc")}</p>
              </div>
            </div>
          </div>
        </Link>
      </CardContent>
    </Card>
  );
};

export default AdminDocumentsManager;
