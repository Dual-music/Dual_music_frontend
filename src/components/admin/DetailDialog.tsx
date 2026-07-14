/**
 * Dialog générique affichage détail entité admin : JSON pretty-print, métadonnées, actions
 * contextuelles.
 */
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Eye } from "lucide-react";
import { formatTz } from "@/lib/datetime";
import { getUiPrefs } from "@/hooks/useUiPreferences";

interface DetailDialogProps {
  title: string;
  data: Record<string, any>;
  triggerText?: string;
}

export const DetailDialog = ({ title, data, triggerText }: DetailDialogProps) => {
  const formatValue = (key: string, value: any): string => {
    if (value === null || value === undefined) return "Non défini";
    if (typeof value === "boolean") return value ? "Oui" : "Non";
    if (typeof value === "object") return JSON.stringify(value, null, 2);
    if (key.includes("date") || key.includes("_at")) {
      const lang = (typeof document !== "undefined" && document.documentElement.lang === "en") ? "en" : "fr";
      return formatTz(value, "dd MMM yyyy HH:mm", { timezone: getUiPrefs().timezone, language: lang as "fr" | "en" });
    }
    if (key.includes("amount") || key.includes("price") || key.includes("earnings") || key.includes("balance")) {
      return `${value} $`;
    }
    return String(value);
  };

  const formatLabel = (key: string): string => {
    const labels: Record<string, string> = {
      id: "ID",
      user_id: "ID Utilisateur",
      created_at: "Date de création",
      updated_at: "Dernière mise à jour",
      status: "Statut",
      email: "Email",
      full_name: "Nom complet",
      stage_name: "Nom de scène",
      bio: "Biographie",
      avatar_url: "Avatar",
      cover_image_url: "Image de couverture",
      social_links: "Réseaux sociaux",
      is_public: "Profil public",
      amount: "Montant",
      payment_method: "Méthode de paiement",
      payment_details: "Détails de paiement",
      description: "Description",
      experience: "Expérience",
      title: "Titre",
      scheduled_date: "Date prévue",
      scheduled_time: "Heure prévue",
      ticket_price: "Prix du ticket",
      max_tickets: "Nombre max de tickets",
      tickets_sold: "Tickets vendus",
      revenue: "Revenus",
      total_earnings: "Gains totaux",
      available_balance: "Solde disponible",
      commission_rate: "Taux de commission",
      display_name: "Nom affiché",
      artist1_id: "Artiste 1",
      artist2_id: "Artiste 2",
      manager_id: "Manager",
      winner_id: "Vainqueur",
      requester_id: "Demandeur",
      opponent_id: "Adversaire",
      proposed_date: "Date proposée",
      message: "Message",
      reviewed_at: "Date de revue",
      reviewed_by: "Revu par",
      processed_at: "Date de traitement",
      processed_by: "Traité par",
      justification_document_url: "Document justificatif",
    };
    return labels[key] || key.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
  };

  // Filter out internal fields
  const filteredData = Object.entries(data).filter(([key]) => 
    !["user_name", "user_email", "requester_name", "opponent_name"].includes(key)
  );

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Eye className="w-4 h-4 mr-2" />
          {triggerText || "Détails"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[70vh]">
          <div className="space-y-4 pr-4">
            {filteredData.map(([key, value]) => (
              <div key={key} className="grid grid-cols-3 gap-4 py-2 border-b border-border last:border-0">
                <span className="font-medium text-muted-foreground">
                  {formatLabel(key)}
                </span>
                <span className="col-span-2 break-words">
                  {key.includes("url") && value ? (
                    <a 
                      href={value} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="text-primary hover:underline"
                    >
                      Voir le fichier
                    </a>
                  ) : (
                    <pre className="whitespace-pre-wrap font-sans text-sm">
                      {formatValue(key, value)}
                    </pre>
                  )}
                </span>
              </div>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};