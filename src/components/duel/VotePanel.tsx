/**
 * Panneau de vote duel (`duel_votes`) : choix artiste + crédits, RPC `cast_duel_vote` atomique, contraintes plan (`subscription_plans`).
 */
/**
 * VotePanel
 * ---------
 * Permet à un spectateur d'acheter des votes pour l'un des deux artistes d'un duel.
 *
 * Pricing : lit `platform_settings.vote_config` (price_per_vote, min/max par
 * transaction) — l'admin peut ajuster en live via PlatformConfigManager.
 *
 * Transaction atomique : appelle le RPC `cast_duel_vote` qui débite le wallet,
 * crée la ligne dans `duel_votes`, met à jour le score et journalise — le tout
 * dans une transaction unique pour éviter les race conditions.
 *
 * Contraintes d'abonnement (Free/Pro/Premium) appliquées côté RPC via
 * `subscription_plans.max_votes_per_duel`.
 *
 * @prop duelId    - id du duel concerné
 * @prop artist1   - { id, name } artiste de gauche
 * @prop artist2   - { id, name } artiste de droite
 * @prop disabled  - désactivé si le duel n'est pas `live`
 */
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import * as wallet from "@/api/endpoints/wallet";
import * as duels from "@/api/endpoints/duels";
import { useAuth } from "@/contexts/AuthContext";
import { VoteAnimation } from "@/components/animations/VoteAnimation";
import { useUserSubscription } from "@/hooks/useSubscription";
import { Lock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { usePlatformSetting } from "@/hooks/usePlatformSettings";

interface VotePanelProps {
  duelId: string;
  artist1Id: string;
  artist2Id: string;
}

interface VoteConfig {
  price_per_vote: number;
  min_votes_per_tx: number;
  max_votes_per_tx: number;
}
const DEFAULT_VOTE_CONFIG: VoteConfig = {
  price_per_vote: 1,
  min_votes_per_tx: 1,
  max_votes_per_tx: 1000,
};

const VotePanel = ({ duelId, artist1Id, artist2Id }: VotePanelProps) => {
  const { t } = useLanguage();
  const { toast } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: voteConfigData } = usePlatformSetting<VoteConfig>("vote_config", DEFAULT_VOTE_CONFIG);
  const voteConfig: VoteConfig = {
    price_per_vote: Number(voteConfigData?.price_per_vote ?? DEFAULT_VOTE_CONFIG.price_per_vote) || 1,
    min_votes_per_tx: Number(voteConfigData?.min_votes_per_tx ?? DEFAULT_VOTE_CONFIG.min_votes_per_tx) || 1,
    max_votes_per_tx: Number(voteConfigData?.max_votes_per_tx ?? DEFAULT_VOTE_CONFIG.max_votes_per_tx) || 1000,
  };

  const [votes, setVotes] = useState<string>(String(voteConfig.min_votes_per_tx));
  const [loading, setLoading] = useState(false);
  const [showAnimation, setShowAnimation] = useState(false);
  const [voteCount, setVoteCount] = useState(0);
  const [animationData, setAnimationData] = useState<{
    amount: number;
    artistName: string;
    color: string;
  } | null>(null);

  const { rules, userId } = useUserSubscription();
  const maxVotes = rules.max_votes_per_duel;
  const isUnlimited = maxVotes === -1;
  const votesRemaining = isUnlimited ? Infinity : Math.max(0, maxVotes - voteCount);

  useEffect(() => {
    if (!userId || isUnlimited) return;
    const fetchCount = async () => {
      // Per-duel vote count derived from the caller's vote history (one row per vote).
      try {
        const history = await duels.myVoteHistory();
        setVoteCount(history.filter((v) => (v as { duel_id?: string }).duel_id === duelId).length);
      } catch {
        setVoteCount(0);
      }
    };
    fetchCount();
  }, [userId, duelId, isUnlimited]);

  const votesNum = Math.max(0, parseInt(votes, 10) || 0);
  const totalCredits = votesNum * voteConfig.price_per_vote;

  const handleVote = async (artistId: string) => {
    setLoading(true);

    if (!user) {
      toast({
        title: t("loginRequired"),
        description: t("mustBeLoggedToVote"),
        variant: "destructive",
      });
      setLoading(false);
      return;
    }

    if (!isUnlimited && votesRemaining <= 0) {
      toast({
        title: t("voteLimitReached"),
        description: t("upgradePlanForMoreVotes"),
        variant: "destructive",
      });
      setLoading(false);
      return;
    }

    if (
      isNaN(votesNum) ||
      votesNum < voteConfig.min_votes_per_tx ||
      votesNum > voteConfig.max_votes_per_tx ||
      totalCredits <= 0
    ) {
      toast({
        title: t("invalidAmountTitle"),
        description: `Min ${voteConfig.min_votes_per_tx} · Max ${voteConfig.max_votes_per_tx} votes / transaction`,
        variant: "destructive",
      });
      setLoading(false);
      return;
    }

    let success = false;
    let error: unknown = null;
    try {
      const res = await wallet.vote(
        { duelId, artistId, amount: totalCredits },
        crypto.randomUUID(),
      );
      success = !!res?.success;
    } catch (e) {
      error = e;
    }

    if (error || !success) {
      const { purchaseErrorKey, purchaseErrorTitleKey } = await import("@/lib/purchaseErrors");
      const code = error ? null : "insufficient_balance";
      toast({
        title: t(purchaseErrorTitleKey(code)),
        description: error ? t("cannotRecordVote") : t(purchaseErrorKey(code)),
        variant: "destructive",
      });
    } else {
      setVoteCount((c) => c + 1);
      const color = artistId === artist1Id ? "hsl(var(--primary))" : "hsl(var(--accent))";
      setAnimationData({
        amount: totalCredits,
        artistName: artistId === artist1Id ? t("artist1Default") : t("artist2Default"),
        color,
      });
      setShowAnimation(true);
      setTimeout(() => setShowAnimation(false), 2000);

      toast({
        title: t("voteRecorded"),
        description: `${votesNum} vote(s) · ${totalCredits} ${t("creditUnit")}`,
      });
      setVotes(String(voteConfig.min_votes_per_tx));
    }

    setLoading(false);
  };

  return (
    <>
      {showAnimation && animationData && (
        <VoteAnimation
          amount={animationData.amount}
          artistName={animationData.artistName}
          color={animationData.color}
        />
      )}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-xl flex items-center justify-between">
            {t("voteLabel")}
            {!isUnlimited && (
              <Badge variant={votesRemaining > 0 ? "secondary" : "destructive"} className="text-xs">
                {votesRemaining} {t("votesRemainingLabel")}
              </Badge>
            )}
            {isUnlimited && (
              <Badge variant="outline" className="text-xs border-primary text-primary">
                ∞ {t("unlimitedLabel")}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isUnlimited && votesRemaining <= 0 ? (
            <div className="text-center space-y-3 py-4">
              <Lock className="w-8 h-8 mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{t("voteLimitReachedDesc")}</p>
              <Button variant="outline" size="sm" onClick={() => navigate("/pricing")}>
                {t("upgradeNow")}
              </Button>
            </div>
          ) : (
            <>
              <div>
                <label className="text-sm text-muted-foreground mb-2 block">
                  {t("voteAmountLabel")} ({voteConfig.price_per_vote} {t("creditUnit")} / vote)
                </label>
                <Input
                  type="number"
                  min={voteConfig.min_votes_per_tx}
                  max={voteConfig.max_votes_per_tx}
                  step="1"
                  value={votes}
                  onChange={(e) => setVotes(e.target.value)}
                  className="mb-2"
                />
                <p className="text-xs text-muted-foreground">
                  Total: <span className="font-semibold text-foreground">{totalCredits.toLocaleString()} {t("creditUnit")}</span>
                </p>
              </div>

              <div className="space-y-2">
                <Button
                  onClick={() => handleVote(artist1Id)}
                  disabled={loading}
                  className="w-full bg-gradient-primary hover:shadow-glow"
                >
                  {t("voteArtist1")}
                </Button>
                <Button
                  onClick={() => handleVote(artist2Id)}
                  disabled={loading}
                  className="w-full bg-gradient-electric hover:shadow-glow"
                >
                  {t("voteArtist2")}
                </Button>
              </div>

              <div className="space-y-2 pt-4 border-t border-border">
                <p className="text-xs text-muted-foreground">{t("quickVotes")}</p>
                <div className="grid grid-cols-3 gap-2">
                  {[1, 5, 10].map((val) => {
                    const clamped = Math.min(voteConfig.max_votes_per_tx, Math.max(voteConfig.min_votes_per_tx, val));
                    return (
                      <Button
                        key={val}
                        variant="outline"
                        size="sm"
                        onClick={() => setVotes(String(clamped))}
                      >
                        {clamped} ×
                      </Button>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </>
  );
};

export default VotePanel;
