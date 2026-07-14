import Header from "@/components/Header";
import SEO from "@/components/seo/SEO";
import Footer from "@/components/Footer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { 
  Users, Wallet, Gift, Trophy, Video, Music2, Play, Star, 
  LogIn, UserPlus, CreditCard, ShoppingCart, Award, Bell, 
  Upload, Settings, Crown, Briefcase, Mic, Eye, Shield
} from "lucide-react";

const UserGuide = () => {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SEO title="Guide d'utilisation — Dual Music" description="Tout pour bien démarrer sur Dual Music : voter, suivre des artistes, organiser des duels." path="/user-guide" />
      <Header />
      <main className="flex-1 pt-24 pb-12 px-4">
        <div className="container max-w-5xl mx-auto">
          <div className="mb-8">
            <Badge className="mb-4">Guide Utilisateur</Badge>
            <h1 className="text-4xl font-bold mb-4">Comment utiliser la plateforme</h1>
            <p className="text-muted-foreground text-lg">
              Guide complet pour profiter de toutes les fonctionnalités de la plateforme de duels musicaux
            </p>
          </div>

          <div className="space-y-8">
            {/* Getting Started */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-primary" />
                  Premiers pas
                </CardTitle>
                <CardDescription>
                  Commencez votre aventure sur la plateforme
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Accordion type="single" collapsible className="w-full">
                  <AccordionItem value="signup">
                    <AccordionTrigger>
                      <span className="flex items-center gap-2">
                        <LogIn className="w-4 h-4" />
                        Créer un compte
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground space-y-2">
                      <p>1. Cliquez sur "Se connecter" dans la barre de navigation</p>
                      <p>2. Sélectionnez "Créer un compte"</p>
                      <p>3. Choisissez votre type de compte :</p>
                      <ul className="ml-6 list-disc space-y-1">
                        <li><strong>Fan</strong> - Pour voter et soutenir les artistes</li>
                        <li><strong>Artiste</strong> - Pour participer aux duels et partager du contenu</li>
                        <li><strong>Manager</strong> - Pour organiser et gérer les duels</li>
                      </ul>
                      <p>4. Remplissez vos informations (email, téléphone, pays)</p>
                      <p>5. Validez votre compte</p>
                      <p className="text-sm mt-2 p-2 bg-accent rounded">
                        💡 Mot de passe oublié ? Cliquez sur "Mot de passe oublié" sur la page de connexion pour recevoir un email de réinitialisation.
                      </p>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="profile">
                    <AccordionTrigger>
                      <span className="flex items-center gap-2">
                        <Settings className="w-4 h-4" />
                        Configurer votre profil
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground space-y-2">
                      <p>Accédez à votre profil pour personnaliser votre expérience :</p>
                      <ul className="ml-6 list-disc space-y-1">
                        <li>Ajoutez votre photo de profil</li>
                        <li>Rédigez une biographie</li>
                        <li>Consultez vos statistiques</li>
                        <li>Gérez votre portefeuille</li>
                      </ul>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </CardContent>
            </Card>

            {/* Wallet & Credits */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wallet className="w-5 h-5 text-primary" />
                  Portefeuille & Crédits
                </CardTitle>
                <CardDescription>
                  Gérez vos crédits pour voter et envoyer des cadeaux
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Accordion type="single" collapsible className="w-full">
                  <AccordionItem value="recharge">
                    <AccordionTrigger>
                      <span className="flex items-center gap-2">
                        <CreditCard className="w-4 h-4" />
                        Recharger votre portefeuille
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground space-y-2">
                      <p>1. Cliquez sur l'icône portefeuille dans la barre de navigation</p>
                      <p>2. Ou accédez à "Recharger Portefeuille" depuis votre profil</p>
                      <p>3. Choisissez un montant prédéfini ou entrez un montant personnalisé</p>
                      <p>4. Procédez au paiement sécurisé via Stripe</p>
                      <p className="text-sm mt-2 p-2 bg-accent rounded">
                        💡 Montant minimum : $5
                      </p>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="use-credits">
                    <AccordionTrigger>
                      <span className="flex items-center gap-2">
                        <ShoppingCart className="w-4 h-4" />
                        Utiliser vos crédits
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground space-y-2">
                      <p>Vos crédits peuvent être utilisés pour :</p>
                      <ul className="ml-6 list-disc space-y-1">
                        <li><strong>Voter</strong> pendant les duels en direct</li>
                        <li><strong>Acheter des cadeaux</strong> dans la boutique</li>
                        <li><strong>Acheter des tickets</strong> pour les concerts</li>
                        <li><strong>Débloquer des replays</strong> premium</li>
                      </ul>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </CardContent>
            </Card>

            {/* Gift Shop */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Gift className="w-5 h-5 text-primary" />
                  Boutique de Cadeaux
                </CardTitle>
                <CardDescription>
                  Achetez et envoyez des cadeaux virtuels
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Accordion type="single" collapsible className="w-full">
                  <AccordionItem value="buy-gifts">
                    <AccordionTrigger>
                      <span className="flex items-center gap-2">
                        <ShoppingCart className="w-4 h-4" />
                        Acheter des cadeaux
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground space-y-2">
                      <p>1. Accédez à la boutique via le menu ou votre profil</p>
                      <p>2. Parcourez le catalogue de cadeaux virtuels</p>
                      <p>3. Cliquez sur "Acheter" pour ajouter à votre inventaire</p>
                      <p>4. Le montant est débité de votre portefeuille</p>
                      <p className="text-sm mt-2 p-2 bg-accent rounded">
                        💡 Vos cadeaux sont stockés dans votre inventaire jusqu'à leur envoi
                      </p>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="send-gifts">
                    <AccordionTrigger>
                      <span className="flex items-center gap-2">
                        <Gift className="w-4 h-4" />
                        Envoyer des cadeaux
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground space-y-2">
                      <p>Pendant un duel en direct :</p>
                      <p>1. Utilisez le panneau "Cadeaux Virtuels"</p>
                      <p>2. Sélectionnez un cadeau de votre inventaire</p>
                      <p>3. Choisissez le destinataire (artiste ou manager)</p>
                      <p>4. Envoyez et regardez l'animation s'afficher !</p>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </CardContent>
            </Card>

            {/* Duels */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-primary" />
                  Duels Musicaux
                </CardTitle>
                <CardDescription>
                  Participez aux battles d'artistes
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Accordion type="single" collapsible className="w-full">
                  <AccordionItem value="watch-duel">
                    <AccordionTrigger>
                      <span className="flex items-center gap-2">
                        <Eye className="w-4 h-4" />
                        Regarder un duel
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground space-y-2">
                      <p>1. Rendez-vous dans la section "Duels"</p>
                      <p>2. Choisissez un duel en direct ou à venir</p>
                      <p>3. Cliquez sur "Regarder" pour rejoindre</p>
                      <p>4. Vous verrez les deux artistes et le manager en vidéo</p>
                      <p>5. Cliquez sur un flux vidéo pour l'agrandir</p>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="vote">
                    <AccordionTrigger>
                      <span className="flex items-center gap-2">
                        <Award className="w-4 h-4" />
                        Voter pour un artiste
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground space-y-2">
                      <p>1. Pendant le duel, utilisez le panneau de vote</p>
                      <p>2. Sélectionnez l'artiste que vous soutenez</p>
                      <p>3. Entrez le nombre de crédits à voter</p>
                      <p>4. Confirmez votre vote</p>
                      <p className="text-sm mt-2 p-2 bg-accent rounded">
                        💡 Plus vous votez, plus vous influencez le résultat !
                      </p>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </CardContent>
            </Card>

            {/* Role-specific Guides */}
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Fan Guide */}
              <Card className="border-green-500/20">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-green-500">
                    <Star className="w-5 h-5" />
                    Guide Fan
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm space-y-2">
                  <p>✓ Regardez les duels en direct</p>
                  <p>✓ Votez pour vos artistes préférés</p>
                  <p>✓ Envoyez des cadeaux virtuels</p>
                  <p>✓ Achetez des tickets de concert</p>
                  <p>✓ Accédez aux replays premium</p>
                  <p>✓ Suivez vos artistes favoris</p>
                  <p>✓ Participez au chat en direct</p>
                </CardContent>
              </Card>

              {/* Artist Guide */}
              <Card className="border-purple-500/20">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-purple-500">
                    <Mic className="w-5 h-5" />
                    Guide Artiste
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm space-y-2">
                  <p>✓ Participez aux duels</p>
                  <p>✓ Recevez des votes et cadeaux</p>
                  <p>✓ Publiez des vidéos lifestyle</p>
                  <p>✓ Suivez vos statistiques</p>
                  <p>✓ Gagnez des revenus</p>
                  <p>✓ Gérez votre profil public</p>
                  <p>✓ Invitez d'autres artistes</p>
                </CardContent>
              </Card>

              {/* Manager Guide */}
              <Card className="border-blue-500/20">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-blue-500">
                    <Briefcase className="w-5 h-5" />
                    Guide Manager
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm space-y-2">
                  <p>✓ Créez et gérez les duels</p>
                  <p>✓ Modérez les événements</p>
                  <p>✓ Suivez les performances</p>
                  <p>✓ Recevez des cadeaux</p>
                  <p>✓ Coordonnez les artistes</p>
                  <p>✓ Activez caméra et micro</p>
                </CardContent>
              </Card>

              {/* Moderator Guide */}
              <Card className="border-orange-500/20">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-orange-500">
                    <Shield className="w-5 h-5" />
                    Guide Modérateur
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm space-y-2">
                  <p>✓ Examinez les signalements</p>
                  <p>✓ Mute / ban en live</p>
                  <p>✓ Stop auto live à 75% signalements</p>
                  <p>✓ Avertissements progressifs</p>
                  <p>✓ Consultez les logs admin</p>
                </CardContent>
              </Card>
            </div>

            {/* Notifications */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bell className="w-5 h-5 text-primary" />
                  Notifications (in-app + Push)
                </CardTitle>
                <CardDescription>Restez informé même quand l'app est fermée</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-muted-foreground text-sm">
                  L'icône de cloche affiche vos notifications in-app. Activez en plus les
                  <strong> notifications push</strong> dans <em>Profil → Préférences → Notifications visuelles</em>
                  pour les recevoir sur votre téléphone ou bureau, même sans avoir l'app ouverte.
                </p>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-center gap-2"><Badge className="bg-blue-500">Vote</Badge>Quand quelqu'un vote pour vous</li>
                  <li className="flex items-center gap-2"><Badge className="bg-pink-500">Cadeau</Badge>Quand vous recevez un cadeau</li>
                  <li className="flex items-center gap-2"><Badge className="bg-yellow-500">Victoire</Badge>Quand vous gagnez un duel</li>
                  <li className="flex items-center gap-2"><Badge className="bg-purple-500">Live</Badge>Quand un artiste suivi démarre un live</li>
                  <li className="flex items-center gap-2"><Badge className="bg-green-500">Paiement</Badge>Recharge ou retrait validé</li>
                </ul>
                <p className="text-xs p-2 bg-accent rounded">
                  💡 Sur iPhone, installez d'abord l'app via <strong>Partager → Ajouter à l'écran d'accueil</strong> avant d'activer les push.
                </p>
              </CardContent>
            </Card>

            {/* Recharges Mobile Money */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-primary" />
                  Recharges Mobile Money & Retraits
                </CardTitle>
                <CardDescription>Orange Money, MTN, Moov, Wave, Stripe</CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-2">
                <p>• <strong>Recharger</strong> : Portefeuille → choisissez votre pays et opérateur → suivez le code USSD reçu sur votre téléphone.</p>
                <p>• <strong>Retirer</strong> (Artistes / Managers) : Profil → Méthodes de retrait → ajoutez un numéro → demandez un retrait.</p>
                <p>• Toutes les transactions apparaissent dans le tableau <strong>Transactions</strong> avec tri, recherche et pagination.</p>
              </CardContent>
            </Card>

            {/* Installation PWA */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Upload className="w-5 h-5 text-primary" />
                  Installer l'app (PWA)
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-2">
                <p><strong>Android / Chrome</strong> : Menu ⋮ → "Installer l'application".</p>
                <p><strong>iPhone / Safari</strong> : Partager ⬆ → "Sur l'écran d'accueil".</p>
                <p><strong>Bureau</strong> : icône d'installation dans la barre d'adresse.</p>
                <p className="text-xs p-2 bg-accent rounded">💡 Une fois installée, l'app s'ouvre en plein écran et reçoit les notifications push.</p>
              </CardContent>
            </Card>

            {/* FAQ */}
            <Card>
              <CardHeader>
                <CardTitle>Questions Fréquentes</CardTitle>
              </CardHeader>
              <CardContent>
                <Accordion type="single" collapsible className="w-full">
                  <AccordionItem value="faq-1">
                    <AccordionTrigger>Comment changer de type de compte ?</AccordionTrigger>
                    <AccordionContent className="text-muted-foreground">
                      Contactez l'administration pour demander un changement de rôle. 
                      Votre demande sera examinée et vous serez notifié de la décision.
                    </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="faq-2">
                    <AccordionTrigger>Les crédits sont-ils remboursables ?</AccordionTrigger>
                    <AccordionContent className="text-muted-foreground">
                      Les crédits achetés ne sont pas remboursables une fois ajoutés 
                      à votre portefeuille. Assurez-vous de n'acheter que ce dont vous avez besoin.
                    </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="faq-3">
                    <AccordionTrigger>Comment devenir artiste vérifié ?</AccordionTrigger>
                    <AccordionContent className="text-muted-foreground">
                      Inscrivez-vous en tant qu'artiste et participez activement aux duels. 
                      Après un certain nombre de participations, vous pourrez demander 
                      la vérification de votre profil.
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </CardContent>
            </Card>

            {/* Compétitions */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-primary" />
                  Compétitions
                </CardTitle>
                <CardDescription>
                  Le 4ᵉ pilier de Dual Music : les managers organisent, les artistes candidatent, le public vote en direct
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Accordion type="single" collapsible className="w-full">
                  <AccordionItem value="comp-create">
                    <AccordionTrigger>
                      <span className="flex items-center gap-2"><Briefcase className="w-4 h-4" /> Organiser une compétition (Manager)</span>
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground space-y-2">
                      <p>Depuis votre profil, ouvrez « 🏆 Mes compétitions » puis « Nouvelle compétition ».</p>
                      <p>Renseignez titre, description, image de couverture, nombre limite de candidats, récompense, frais d'inscription éventuels, pays éligibles, dates d'ouverture/clôture des candidatures et date/heure de début/fin.</p>
                      <p>Choisissez le mode <strong>En ligne</strong> (candidats retenus diffusent leur caméra) ou <strong>Présentiel</strong> (seul le manager filme depuis le lieu : pays, ville, commune, quartier, adresse exacte).</p>
                    </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="comp-apply">
                    <AccordionTrigger>
                      <span className="flex items-center gap-2"><Mic className="w-4 h-4" /> Déposer ma candidature (Artiste)</span>
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground space-y-2">
                      <p>Toute personne voit l'annonce sur la page Compétitions, mais seuls les artistes peuvent candidater.</p>
                      <p>Entre la date d'ouverture et la date de clôture, cliquez sur « Déposer ma candidature », ajoutez pitch et vidéo démo, puis réglez les frais d'inscription si demandés.</p>
                      <p>Vous êtes notifié dès que le manager approuve ou refuse votre dossier.</p>
                    </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="comp-publish">
                    <AccordionTrigger>
                      <span className="flex items-center gap-2"><Eye className="w-4 h-4" /> Publication & accès au direct</span>
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground space-y-2">
                      <p>Après clôture et validation des candidatures, le manager publie en précisant si l'accès est <strong>gratuit</strong> ou <strong>payant</strong>.</p>
                      <p>Le bouton « Voir candidats » affiche la liste publique. Les spectateurs achètent leur billet avant le début, puis accèdent au direct à l'heure prévue.</p>
                    </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="comp-live">
                    <AccordionTrigger>
                      <span className="flex items-center gap-2"><Video className="w-4 h-4" /> Pendant le direct</span>
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground space-y-2">
                      <p>En ligne : tous les candidats retenus et le manager rejoignent la scène et activent caméra/micro.</p>
                      <p>Présentiel : seul le manager filme depuis la salle.</p>
                      <p>Mêmes privilèges que les duels et concerts : chat, j'aimes, emojis, cadeaux virtuels avec boutique en pop-up (sans quitter le direct), partages, publicités, panneau du meilleur donateur, chronomètre par candidat, vote en direct et annonce du classement final avec acclamations.</p>
                    </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="comp-replay">
                    <AccordionTrigger>
                      <span className="flex items-center gap-2"><Play className="w-4 h-4" /> Replays</span>
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground space-y-2">
                      <p>Les compétitions enregistrées sont disponibles dans Replays avec un badge 🏆 Compétition, selon la politique d'accès du manager.</p>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default UserGuide;