/**
 * Admin: SubscriptionPlansManager — CRUD des plans d'abonnement.
 *
 * Gère la table `subscription_plans` (Free, Pro, Premium) : prix, quotas
 * de votes, avantages, statut actif. Les gates côté client (vote, accès
 * fonctionnalités) consultent ces plans via `useSubscription`.
 *
 * @access  role=admin
 * @see     src/hooks/useSubscription.ts
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as subscriptions from "@/api/endpoints/subscriptions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { Save, Plus, Trash2, Star, Zap, Crown } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

interface PlanData {
  id: string; name: string; description: string; price: number; currency: string;
  icon: string; gradient: string; sort_order: number; is_active: boolean;
  features: string[]; rules: Record<string, any>;
}

const ICON_OPTIONS = [
  { value: "Star", label: "⭐ Star" },
  { value: "Zap", label: "⚡ Zap" },
  { value: "Crown", label: "👑 Crown" },
];

export const SubscriptionPlansManager = () => {
  const { toast } = useToast();
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const [editingPlan, setEditingPlan] = useState<PlanData | null>(null);
  const [saving, setSaving] = useState(false);
  const [newFeature, setNewFeature] = useState("");

  const RULE_LABELS: Record<string, string> = {
    max_votes_per_duel: t("adminSubsMaxVotes"),
    premium_replays: t("adminSubsPremiumReplays"),
    early_access: t("adminSubsEarlyAccess"),
    virtual_meets: t("adminSubsVirtualMeets"),
    exclusive_gifts: t("adminSubsExclusiveGifts"),
    no_ads: t("adminSubsNoAds"),
    exclusive_content: t("adminSubsExclusiveContent"),
    priority_support: t("adminSubsPrioritySupport"),
  };

  const { data: plans, isLoading } = useQuery({
    queryKey: ["admin-subscription-plans"],
    queryFn: async () => {
      const data = await subscriptions.listPlans();
      return (data as unknown) as PlanData[];
    },
  });

  const handleSave = async (plan: PlanData) => {
    setSaving(true);
    try {
      const body = {
        name: plan.name, description: plan.description, price: plan.price,
        currency: plan.currency, icon: plan.icon, gradient: plan.gradient,
        sort_order: plan.sort_order, is_active: plan.is_active,
        features: plan.features, rules: plan.rules,
      };
      // Existing plan (its id is in the loaded list) → PATCH; otherwise POST.
      const isExisting = plans?.some((p) => p.id === plan.id);
      if (isExisting) {
        await subscriptions.updatePlan(plan.id, body);
      } else {
        await subscriptions.createPlan(body);
      }
      toast({ title: t("adminSubsSaved"), description: t("adminSubsSavedDesc") });
      queryClient.invalidateQueries({ queryKey: ["admin-subscription-plans"] });
      queryClient.invalidateQueries({ queryKey: ["subscription-plans"] });
      setEditingPlan(null);
    } catch (error: any) {
      toast({ title: t("error"), description: error?.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const handleDelete = async (planId: string) => {
    if (planId === "free") {
      toast({ title: t("adminSubsCantDelete"), description: t("adminSubsCantDeleteDesc"), variant: "destructive" });
      return;
    }
    try {
      await subscriptions.removePlan(planId);
      toast({ title: t("adminSubsDeleted") });
      queryClient.invalidateQueries({ queryKey: ["admin-subscription-plans"] });
    } catch (error: any) {
      toast({ title: t("error"), description: error?.message, variant: "destructive" });
    }
  };

  const addNewPlan = () => {
    setEditingPlan({
      id: `plan_${Date.now()}`, name: "New Plan", description: "", price: 0, currency: "EUR",
      icon: "Star", gradient: "from-blue-500 to-cyan-500", sort_order: (plans?.length || 0) + 1, is_active: true,
      features: [], rules: { max_votes_per_duel: 3, premium_replays: false, early_access: false, virtual_meets: false, exclusive_gifts: false, no_ads: false, exclusive_content: false, priority_support: false },
    });
  };

  const getIcon = (icon: string) => {
    switch (icon) {
      case "Zap": return <Zap className="w-5 h-5" />;
      case "Crown": return <Crown className="w-5 h-5" />;
      default: return <Star className="w-5 h-5" />;
    }
  };

  if (isLoading) return <div className="text-center py-8">{t("loading")}...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{t("adminSubsTitle")}</h3>
        <Button onClick={addNewPlan} size="sm"><Plus className="w-4 h-4 mr-1" />{t("adminSubsAddPlan")}</Button>
      </div>

      <div className="grid gap-4">
        {plans?.map((plan) => (
          <Card key={plan.id} className={`${!plan.is_active ? "opacity-50" : ""}`}>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full bg-gradient-to-r ${plan.gradient} flex items-center justify-center text-white`}>
                    {getIcon(plan.icon)}
                  </div>
                  <div>
                    <p className="font-semibold flex items-center gap-2">
                      {plan.name}
                      {!plan.is_active && <Badge variant="outline">{t("adminSubsInactive")}</Badge>}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {plan.price === 0 ? t("adminSubsFree") : `$${plan.price}${t("adminSubsPerMonth")}`} · {(plan.features as string[])?.length || 0} {t("adminSubsFeatures")}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setEditingPlan({ ...plan })}>{t("adminSubsEdit")}</Button>
                  {plan.id !== "free" && <Button variant="destructive" size="sm" onClick={() => handleDelete(plan.id)}><Trash2 className="w-4 h-4" /></Button>}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={!!editingPlan} onOpenChange={(o) => !o && setEditingPlan(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingPlan && plans?.find((p) => p.id === editingPlan.id) ? t("adminSubsEditPlan") : t("adminSubsNewPlan")}</DialogTitle>
          </DialogHeader>
          {editingPlan && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div><Label>{t("adminSubsPlanName")}</Label><Input value={editingPlan.name} onChange={(e) => setEditingPlan({ ...editingPlan, name: e.target.value })} /></div>
                <div><Label>{t("adminSubsPrice")}</Label><Input type="number" step="0.01" value={editingPlan.price} onChange={(e) => setEditingPlan({ ...editingPlan, price: parseFloat(e.target.value) || 0 })} /></div>
              </div>
              <div><Label>{t("adminSubsDescription")}</Label><Input value={editingPlan.description} onChange={(e) => setEditingPlan({ ...editingPlan, description: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{t("adminSubsIcon")}</Label>
                  <select className="w-full border rounded-md p-2 bg-background" value={editingPlan.icon} onChange={(e) => setEditingPlan({ ...editingPlan, icon: e.target.value })}>
                    {ICON_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div><Label>{t("adminSubsGradient")}</Label><Input value={editingPlan.gradient} onChange={(e) => setEditingPlan({ ...editingPlan, gradient: e.target.value })} placeholder="from-purple-500 to-pink-500" /></div>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={editingPlan.is_active} onCheckedChange={(v) => setEditingPlan({ ...editingPlan, is_active: v })} />
                <Label>{t("adminSubsActivePlan")}</Label>
              </div>
              <div>
                <Label className="text-base font-semibold">{t("adminSubsDisplayedFeatures")}</Label>
                <div className="space-y-2 mt-2">
                  {(editingPlan.features as string[]).map((f, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input value={f} onChange={(e) => { const updated = [...editingPlan.features]; updated[i] = e.target.value; setEditingPlan({ ...editingPlan, features: updated }); }} />
                      <Button variant="ghost" size="sm" onClick={() => setEditingPlan({ ...editingPlan, features: editingPlan.features.filter((_, idx) => idx !== i) })}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <Input placeholder={t("adminSubsNewFeature")} value={newFeature} onChange={(e) => setNewFeature(e.target.value)} />
                    <Button size="sm" onClick={() => { if (newFeature.trim()) { setEditingPlan({ ...editingPlan, features: [...editingPlan.features, newFeature.trim()] }); setNewFeature(""); } }}><Plus className="w-4 h-4" /></Button>
                  </div>
                </div>
              </div>
              <div>
                <Label className="text-base font-semibold">{t("adminSubsPlanRules")}</Label>
                <div className="space-y-3 mt-2">
                  {Object.entries(RULE_LABELS).map(([key, label]) => (
                    <div key={key} className="flex items-center justify-between p-2 bg-muted/30 rounded-md">
                      <span className="text-sm">{label}</span>
                      {key === "max_votes_per_duel" ? (
                        <Input type="number" className="w-24" value={editingPlan.rules[key] ?? 3} onChange={(e) => setEditingPlan({ ...editingPlan, rules: { ...editingPlan.rules, [key]: parseInt(e.target.value) || 0 } })} />
                      ) : (
                        <Switch checked={!!editingPlan.rules[key]} onCheckedChange={(v) => setEditingPlan({ ...editingPlan, rules: { ...editingPlan.rules, [key]: v } })} />
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditingPlan(null)}>{t("adminSubsCancel")}</Button>
                <Button onClick={() => handleSave(editingPlan)} disabled={saving}><Save className="w-4 h-4 mr-1" />{saving ? t("adminSubsSaving") : t("adminSubsSave")}</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
