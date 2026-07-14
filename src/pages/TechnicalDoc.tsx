import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Database, Shield, Zap, Globe, Server, Code, Users, Lock, Layers, GitBranch, Bell, Smartphone, Radio, CreditCard, Table as TableIcon } from "lucide-react";

const TechnicalDoc = () => {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 pt-24 pb-12 px-4">
        <div className="container max-w-5xl mx-auto">
          <div className="mb-8">
            <Badge className="mb-4">Documentation Technique</Badge>
            <h1 className="text-4xl font-bold mb-4">Architecture & Technologies</h1>
            <p className="text-muted-foreground text-lg">
              Documentation technique complète de la plateforme de duels musicaux
            </p>
          </div>

          <div className="space-y-8">
            {/* Architecture Overview */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Layers className="w-5 h-5 text-primary" />
                  Vue d'ensemble de l'architecture
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p>
                  L'application est construite selon une architecture moderne full-stack, 
                  utilisant React pour le frontend et Supabase comme Backend-as-a-Service (BaaS).
                </p>
                <div className="grid md:grid-cols-3 gap-4 mt-4">
                  <div className="p-4 bg-accent/50 rounded-lg">
                    <Globe className="w-6 h-6 mb-2 text-blue-500" />
                    <h4 className="font-semibold">Frontend</h4>
                    <p className="text-sm text-muted-foreground">React + TypeScript + Vite</p>
                  </div>
                  <div className="p-4 bg-accent/50 rounded-lg">
                    <Server className="w-6 h-6 mb-2 text-green-500" />
                    <h4 className="font-semibold">Backend</h4>
                    <p className="text-sm text-muted-foreground">Supabase (PostgreSQL)</p>
                  </div>
                  <div className="p-4 bg-accent/50 rounded-lg">
                    <Zap className="w-6 h-6 mb-2 text-yellow-500" />
                    <h4 className="font-semibold">Temps réel</h4>
                    <p className="text-sm text-muted-foreground">Supabase Realtime</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Tech Stack */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Code className="w-5 h-5 text-primary" />
                  Stack Technologique
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-semibold mb-3">Frontend</h4>
                    <ul className="space-y-2 text-sm">
                      <li className="flex items-center gap-2">
                        <Badge variant="outline">React 18</Badge>
                        Framework UI
                      </li>
                      <li className="flex items-center gap-2">
                        <Badge variant="outline">TypeScript</Badge>
                        Typage statique
                      </li>
                      <li className="flex items-center gap-2">
                        <Badge variant="outline">Vite</Badge>
                        Build & Dev Server
                      </li>
                      <li className="flex items-center gap-2">
                        <Badge variant="outline">TailwindCSS</Badge>
                        Styling utilitaire
                      </li>
                      <li className="flex items-center gap-2">
                        <Badge variant="outline">shadcn/ui</Badge>
                        Composants UI
                      </li>
                      <li className="flex items-center gap-2">
                        <Badge variant="outline">Framer Motion</Badge>
                        Animations
                      </li>
                      <li className="flex items-center gap-2">
                        <Badge variant="outline">React Router</Badge>
                        Navigation SPA
                      </li>
                      <li className="flex items-center gap-2">
                        <Badge variant="outline">TanStack Query</Badge>
                        Gestion du cache
                      </li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-3">Backend & Services</h4>
                    <ul className="space-y-2 text-sm">
                      <li className="flex items-center gap-2">
                        <Badge variant="outline">Supabase</Badge>
                        BaaS (Backend-as-a-Service)
                      </li>
                      <li className="flex items-center gap-2">
                        <Badge variant="outline">PostgreSQL</Badge>
                        Base de données
                      </li>
                      <li className="flex items-center gap-2">
                        <Badge variant="outline">Row Level Security</Badge>
                        Sécurité données
                      </li>
                      <li className="flex items-center gap-2">
                        <Badge variant="outline">Supabase Auth</Badge>
                        Authentification
                      </li>
                      <li className="flex items-center gap-2">
                        <Badge variant="outline">Realtime</Badge>
                        WebSocket natif
                      </li>
                      <li className="flex items-center gap-2">
                        <Badge variant="outline">Edge Functions</Badge>
                        Logique serveur
                      </li>
                      <li className="flex items-center gap-2">
                        <Badge variant="outline">Stripe</Badge>
                        Paiements
                      </li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Database Schema */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="w-5 h-5 text-primary" />
                  Schéma de Base de Données
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 font-semibold">Table</th>
                        <th className="text-left py-2 font-semibold">Description</th>
                        <th className="text-left py-2 font-semibold">Relations</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      <tr>
                        <td className="py-2"><code className="bg-accent px-1 rounded">profiles</code></td>
                        <td className="py-2">Profils utilisateurs</td>
                        <td className="py-2 text-muted-foreground">auth.users</td>
                      </tr>
                      <tr>
                        <td className="py-2"><code className="bg-accent px-1 rounded">user_roles</code></td>
                        <td className="py-2">Rôles (admin, artist, manager, fan)</td>
                        <td className="py-2 text-muted-foreground">profiles</td>
                      </tr>
                      <tr>
                        <td className="py-2"><code className="bg-accent px-1 rounded">user_wallets</code></td>
                        <td className="py-2">Portefeuilles virtuels</td>
                        <td className="py-2 text-muted-foreground">profiles</td>
                      </tr>
                      <tr>
                        <td className="py-2"><code className="bg-accent px-1 rounded">duels</code></td>
                        <td className="py-2">Duels musicaux</td>
                        <td className="py-2 text-muted-foreground">profiles (artistes, manager)</td>
                      </tr>
                      <tr>
                        <td className="py-2"><code className="bg-accent px-1 rounded">duel_votes</code></td>
                        <td className="py-2">Votes sur les duels</td>
                        <td className="py-2 text-muted-foreground">duels, profiles</td>
                      </tr>
                      <tr>
                        <td className="py-2"><code className="bg-accent px-1 rounded">duel_chat_messages</code></td>
                        <td className="py-2">Messages du chat en direct</td>
                        <td className="py-2 text-muted-foreground">duels, profiles</td>
                      </tr>
                      <tr>
                        <td className="py-2"><code className="bg-accent px-1 rounded">virtual_gifts</code></td>
                        <td className="py-2">Catalogue de cadeaux</td>
                        <td className="py-2 text-muted-foreground">-</td>
                      </tr>
                      <tr>
                        <td className="py-2"><code className="bg-accent px-1 rounded">user_gifts</code></td>
                        <td className="py-2">Inventaire cadeaux utilisateur</td>
                        <td className="py-2 text-muted-foreground">profiles, virtual_gifts</td>
                      </tr>
                      <tr>
                        <td className="py-2"><code className="bg-accent px-1 rounded">gift_transactions</code></td>
                        <td className="py-2">Envoi de cadeaux</td>
                        <td className="py-2 text-muted-foreground">profiles, virtual_gifts, duels</td>
                      </tr>
                      <tr>
                        <td className="py-2"><code className="bg-accent px-1 rounded">artist_followers</code></td>
                        <td className="py-2">Abonnements aux artistes</td>
                        <td className="py-2 text-muted-foreground">profiles</td>
                      </tr>
                      <tr>
                        <td className="py-2"><code className="bg-accent px-1 rounded">fan_subscriptions</code></td>
                        <td className="py-2">Abonnements premium Stripe</td>
                        <td className="py-2 text-muted-foreground">profiles</td>
                      </tr>
                      <tr>
                        <td className="py-2"><code className="bg-accent px-1 rounded">notifications</code></td>
                        <td className="py-2">Notifications temps réel</td>
                        <td className="py-2 text-muted-foreground">profiles</td>
                      </tr>
                      <tr>
                        <td className="py-2"><code className="bg-accent px-1 rounded">concerts</code></td>
                        <td className="py-2">Concerts virtuels</td>
                        <td className="py-2 text-muted-foreground">-</td>
                      </tr>
                      <tr>
                        <td className="py-2"><code className="bg-accent px-1 rounded">lifestyle_videos</code></td>
                        <td className="py-2">Vidéos lifestyle artistes</td>
                        <td className="py-2 text-muted-foreground">profiles</td>
                      </tr>
                      <tr>
                        <td className="py-2"><code className="bg-accent px-1 rounded">blogs</code></td>
                        <td className="py-2">Articles de blog avec vues</td>
                        <td className="py-2 text-muted-foreground">profiles</td>
                      </tr>
                      <tr>
                        <td className="py-2"><code className="bg-accent px-1 rounded">push_subscriptions</code></td>
                        <td className="py-2">Abonnements Web Push (VAPID)</td>
                        <td className="py-2 text-muted-foreground">profiles</td>
                      </tr>
                      <tr>
                        <td className="py-2"><code className="bg-accent px-1 rounded">credit_purchases</code></td>
                        <td className="py-2">Recharges (Stripe / CinetPay / Moneroo)</td>
                        <td className="py-2 text-muted-foreground">profiles</td>
                      </tr>
                      <tr>
                        <td className="py-2"><code className="bg-accent px-1 rounded">revenue_distributions</code></td>
                        <td className="py-2">Répartition atomique des revenus (RPC)</td>
                        <td className="py-2 text-muted-foreground">profiles, duels, gifts</td>
                      </tr>
                      <tr>
                        <td className="py-2"><code className="bg-accent px-1 rounded">payout_methods</code></td>
                        <td className="py-2">Comptes de retrait Mobile Money / Bank</td>
                        <td className="py-2 text-muted-foreground">profiles</td>
                      </tr>
                      <tr>
                        <td className="py-2"><code className="bg-accent px-1 rounded">platform_settings</code></td>
                        <td className="py-2">Config clé/valeur (VAPID, pourcentages, contacts)</td>
                        <td className="py-2 text-muted-foreground">-</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* Security */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="w-5 h-5 text-primary" />
                  Sécurité
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-semibold mb-2 flex items-center gap-2">
                      <Lock className="w-4 h-4" />
                      Row Level Security (RLS)
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      Toutes les tables utilisent RLS pour garantir que les utilisateurs 
                      ne peuvent accéder qu'à leurs propres données. Les politiques sont 
                      définies au niveau de la base de données.
                    </p>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2 flex items-center gap-2">
                      <Users className="w-4 h-4" />
                      Gestion des rôles
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      Les rôles sont stockés dans une table séparée avec une fonction 
                      <code className="mx-1 bg-accent px-1 rounded">has_role()</code> 
                      sécurisée pour les vérifications.
                    </p>
                  </div>
                </div>
                
                <Separator className="my-4" />
                
                <div>
                  <h4 className="font-semibold mb-2">Rôles disponibles</h4>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className="border-red-500">admin</Badge>
                    <Badge variant="outline" className="border-purple-500">artist</Badge>
                    <Badge variant="outline" className="border-blue-500">manager</Badge>
                    <Badge variant="outline" className="border-orange-500">moderator</Badge>
                    <Badge variant="outline" className="border-green-500">fan</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Real-time Features */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="w-5 h-5 text-primary" />
                  Fonctionnalités Temps Réel
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  <li className="flex items-start gap-3">
                    <Badge className="bg-green-500 mt-0.5">Live</Badge>
                    <div>
                      <p className="font-medium">Votes en direct</p>
                      <p className="text-sm text-muted-foreground">
                        Les votes sont synchronisés en temps réel pour tous les spectateurs via Supabase Realtime.
                      </p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <Badge className="bg-pink-500 mt-0.5">Live</Badge>
                    <div>
                      <p className="font-medium">Cadeaux virtuels</p>
                      <p className="text-sm text-muted-foreground">
                        Les animations de cadeaux s'affichent pour tous les participants lors de l'envoi.
                      </p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <Badge className="bg-blue-500 mt-0.5">Live</Badge>
                    <div>
                      <p className="font-medium">Notifications</p>
                      <p className="text-sm text-muted-foreground">
                        Les artistes reçoivent des notifications instantanées pour les votes et cadeaux.
                      </p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <Badge className="bg-purple-500 mt-0.5">Live</Badge>
                    <div>
                      <p className="font-medium">Chat en direct</p>
                      <p className="text-sm text-muted-foreground">
                        Les messages du chat s'affichent en temps réel pendant les duels avec modération automatique.
                      </p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <Badge className="bg-yellow-500 mt-0.5">Live</Badge>
                    <div>
                      <p className="font-medium">Présence</p>
                      <p className="text-sm text-muted-foreground">
                        Le compteur de viewers est mis à jour en temps réel via Presence channels.
                      </p>
                    </div>
                  </li>
                </ul>
              </CardContent>
            </Card>

            {/* API & Integration */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <GitBranch className="w-5 h-5 text-primary" />
                  Intégrations
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="p-4 border rounded-lg">
                    <h4 className="font-semibold mb-2">Stripe</h4>
                    <p className="text-sm text-muted-foreground">
                      Intégration pour les paiements (recharge de portefeuille, abonnements premium, achats de tickets).
                      Utilise Stripe Checkout et les webhooks pour une expérience de paiement sécurisée.
                    </p>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <h4 className="font-semibold mb-2">Supabase Auth</h4>
                    <p className="text-sm text-muted-foreground">
                      Authentification par email avec confirmation automatique et récupération de mot de passe.
                      Support pour la connexion par téléphone avec codes pays.
                    </p>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <h4 className="font-semibold mb-2">Supabase Storage</h4>
                    <p className="text-sm text-muted-foreground">
                      Stockage des fichiers (avatars, photos de couverture, vidéos lifestyle).
                      Upload direct depuis la galerie avec preview.
                    </p>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <h4 className="font-semibold mb-2">CinetPay & Moneroo (Multi-pays Afrique)</h4>
                    <p className="text-sm text-muted-foreground">
                      Recharges et retraits Mobile Money pour 15+ pays (Orange Money, MTN, Moov, Wave, etc.).
                      Secrets stockés par pays côté Cloud, init OAuth V2 via Edge Functions <code className="bg-accent px-1 rounded">cinetpay-payin-init</code> et <code className="bg-accent px-1 rounded">cinetpay-payout-init</code>, vérification canonique des webhooks.
                    </p>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <h4 className="font-semibold mb-2">LiveKit Cloud (SFU)</h4>
                    <p className="text-sm text-muted-foreground">
                      Infrastructure SFU pour tous les flux (duels, lives, concerts). Token JWT généré par
                      l'Edge Function <code className="bg-accent px-1 rounded">livekit-token</code>. Côté client, <code className="bg-accent px-1 rounded">useLiveKit</code> + <code className="bg-accent px-1 rounded">buildLocalStream</code> gèrent le miroir local et le switch caméra via <code className="bg-accent px-1 rounded">replaceTrack</code>.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Push Notifications */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bell className="w-5 h-5 text-primary" />
                  Notifications Push (Web Push API)
                </CardTitle>
                <CardDescription>Réception même quand l'onglet est fermé (Vercel / VPS)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p className="text-muted-foreground">
                  Le service worker <code className="bg-accent px-1 rounded">public/push-sw.js</code> écoute l'événement <code className="bg-accent px-1 rounded">push</code>
                  et affiche une notification système. L'abonnement est stocké dans la table <code className="bg-accent px-1 rounded">push_subscriptions</code> (endpoint + p256dh + auth).
                </p>
                <div className="p-3 bg-accent/50 rounded-lg">
                  <p className="font-semibold mb-1">Flux complet :</p>
                  <ol className="list-decimal ml-5 space-y-1 text-muted-foreground">
                    <li>L'utilisateur active les notifications dans <em>Profil → Préférences</em>.</li>
                    <li>Le client demande la permission, s'abonne avec la VAPID public key (table <code>platform_settings.push_config</code>).</li>
                    <li>L'abonnement est upserté dans <code>push_subscriptions</code>.</li>
                    <li>Les Edge Functions appellent <code>send-push</code> qui signe la requête VAPID et POST sur l'endpoint.</li>
                  </ol>
                </div>
                <p className="text-xs text-muted-foreground">
                  Secrets requis : <code className="bg-accent px-1 rounded">VAPID_PUBLIC_KEY</code>, <code className="bg-accent px-1 rounded">VAPID_PRIVATE_KEY</code>, <code className="bg-accent px-1 rounded">VAPID_SUBJECT</code>.
                </p>
              </CardContent>
            </Card>

            {/* PWA */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Smartphone className="w-5 h-5 text-primary" />
                  PWA & Mobile
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p>• Stratégie strictement <strong>Network-Only</strong> pour éviter tout cache obsolète.</p>
                <p>• Limite Workbox 5 MB ; polling background toutes les 20 s.</p>
                <p>• Clavier mobile stable via <strong>VisualViewport API</strong> en plein écran.</p>
                <p>• Tabs responsives : <code className="bg-accent px-1 rounded">flex-wrap</code> + icônes en ligne, menu hamburger mobile.</p>
                <p>• Tableau transactions modernisé (tri, recherche, pagination, taille de page) via <code className="bg-accent px-1 rounded">AdminTable</code>, traduit FR/EN.</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default TechnicalDoc;