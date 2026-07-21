import { useEffect, useState } from "react";
import SEO from "@/components/seo/SEO";
import { useNavigate } from "react-router-dom";
import * as gifts_api from "@/api/endpoints/gifts";
import * as wallet from "@/api/endpoints/wallet";
import { useAuth } from "@/contexts/AuthContext";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Gift, Wallet, ShoppingCart, Package, Minus, Plus } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useWallet } from "@/hooks/useWallet";

interface VirtualGift {
  id: string;
  name: string;
  price: number;
  image_url: string | null;
}

interface UserGift {
  id: string;
  gift_id: string;
  quantity: number;
  gift?: VirtualGift;
}

const GiftShop = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useLanguage();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [gifts, setGifts] = useState<VirtualGift[]>([]);
  const [userGifts, setUserGifts] = useState<UserGift[]>([]);
  const { balance: walletBalance } = useWallet();
  const [purchasing, setPurchasing] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      if (!user) {
        navigate("/auth");
        return;
      }

      const giftsData = await gifts_api.listGifts();
      setGifts(
        (giftsData ?? []).map((g) => ({
          id: g.id,
          name: g.name,
          // Le backend renvoie `price` (le champ `price_credits` n'existe pas) — on lit
          // les deux par sécurité pour que le prix s'affiche toujours.
          price: Number(g.price_credits ?? (g as { price?: number }).price ?? 0),
          image_url: (g.image_url as string | null) ?? null,
        })),
      );

      const userGiftsData = await gifts_api.myInventory();
      setUserGifts((userGiftsData ?? []) as unknown as UserGift[]);

      // wallet balance is live via useWallet()
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handlePurchase = async (gift: VirtualGift, quantity: number = 1) => {
    const totalCost = gift.price * quantity;
    
    if (walletBalance < totalCost) {
      toast({
        title: t("insufficientBalance"),
        description: t("insufficientBalanceDesc"),
        variant: "destructive",
      });
      return;
    }

    setPurchasing(gift.id);

    try {
      if (!user) throw new Error("User not authenticated");

      await wallet.purchaseGift(
        { giftId: gift.id, quantity },
        crypto.randomUUID(),
      );

      toast({
        title: t("purchaseSuccess"),
        description: `${t("purchaseSuccessDesc")} ${quantity}x ${gift.name}`,
      });

      loadData();

    } catch (error) {
      console.error("Error purchasing gift:", error);
      toast({
        title: t("error"),
        description: t("purchaseError"),
        variant: "destructive",
      });
    } finally {
      setPurchasing(null);
    }
  };

  const getGiftQuantity = (giftId: string) => {
    const userGift = userGifts.find(ug => ug.gift_id === giftId);
    return userGift?.quantity || 0;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">{t("loading")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SEO title="Boutique cadeaux virtuels — Dual Music" description="Offrez des cadeaux virtuels animés aux artistes lors des duels et concerts en direct." path="/gift-shop" />
      <Header />
      <main className="flex-1 pt-24 pb-12 px-4">
        <div className="container max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
            <div>
              <h1 className="text-4xl font-bold mb-2 flex items-center gap-3">
                <Gift className="w-10 h-10 text-primary" />
                {t("giftShopTitle")}
              </h1>
              <p className="text-muted-foreground">
                {t("giftShopSubtitle")}
              </p>
            </div>
            <Card className="p-4 flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Wallet className="w-5 h-5 text-primary" />
                <span className="text-2xl font-bold">{walletBalance.toLocaleString("fr-FR")} Crédits</span>
              </div>
              <Button onClick={() => navigate("/wallet")} variant="outline" size="sm">
                {t("rechargeWallet")}
              </Button>
            </Card>
          </div>

          {userGifts.length > 0 && (
            <Card className="mb-8">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="w-5 h-5" />
                  {t("yourInventory")}
                </CardTitle>
                <CardDescription>
                  {t("inventoryDesc")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-4">
                  {userGifts.map((userGift) => {
                    const gift = gifts.find(g => g.id === userGift.gift_id);
                    if (!gift) return null;
                    return (
                      <div
                        key={userGift.id}
                        className="flex items-center gap-3 bg-accent/50 px-4 py-2 rounded-full"
                      >
                        <span className="text-2xl">{gift.image_url}</span>
                        <span className="font-medium">{gift.name}</span>
                        <Badge variant="secondary" className="font-bold">
                          x{userGift.quantity}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {gifts.map((gift) => {
              const ownedQuantity = getGiftQuantity(gift.id);
              return (
                <Card key={gift.id} className="overflow-hidden hover:shadow-lg transition-shadow">
                  <div className="aspect-square bg-gradient-to-br from-primary/10 to-accent/10 flex items-center justify-center">
                    <span className="text-8xl">{gift.image_url}</span>
                  </div>
                  <CardContent className="p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-lg">{gift.name}</h3>
                      {ownedQuantity > 0 && (
                        <Badge className="bg-green-500">x{ownedQuantity}</Badge>
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-2xl font-bold text-primary">{gift.price.toLocaleString("fr-FR")} Crédits</span>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          onClick={() => handlePurchase(gift, 1)}
                          disabled={purchasing === gift.id || walletBalance < gift.price}
                          className="gap-1"
                        >
                          <ShoppingCart className="w-4 h-4" />
                          {t("buyGift")}
                        </Button>
                      </div>
                    </div>
                    {walletBalance < gift.price && (
                      <p className="text-xs text-destructive text-center">
                        {t("insufficientBalance")}
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {gifts.length === 0 && (
            <Card className="p-12 text-center">
              <Gift className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-xl font-semibold mb-2">{t("noGiftsAvailable")}</h3>
              <p className="text-muted-foreground">
                {t("noGiftsHint")}
              </p>
            </Card>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default GiftShop;
