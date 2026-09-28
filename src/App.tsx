import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { ScrollToTop } from "@/components/ScrollToTop";
import { AnimatePresence } from "framer-motion";
import { PageTransition } from "@/components/PageTransition";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Profile from "./pages/Profile";
import Admin from "./pages/Admin";
import DuelManagement from "./pages/DuelManagement";
import WalletRecharge from "./pages/WalletRecharge";
import Duels from "./pages/Duels";
import DuelLive from "./pages/DuelLive";
import DuelRecordingView from "./pages/DuelRecordingView";
import Lives from "./pages/Lives";
import Concerts from "./pages/Concerts";
import ConcertDetail from "./pages/ConcertDetail";
import ConcertLive from "./pages/ConcertLive";
import LiveStream from "./pages/LiveStream";
import LiveRecordingView from "./pages/LiveRecordingView";
import Lifestyle from "./pages/Lifestyle";
import VideoDetail from "./pages/VideoDetail";
import Replays from "./pages/Replays";
import ReplayDetail from "./pages/ReplayDetail";
import GiftShop from "./pages/GiftShop";
import Transactions from "./pages/Transactions";
import TechnicalDoc from "./pages/TechnicalDoc";
import UserGuide from "./pages/UserGuide";
import HelpCenter from "./pages/HelpCenter";
import Pricing from "./pages/Pricing";
import Blog from "./pages/Blog";
import BlogDetail from "./pages/BlogDetail";
import Leaderboard from "./pages/Leaderboard";
import ApiDocs from "./pages/ApiDocs";
import Terms from "./pages/Terms";
import Privacy from "./pages/Privacy";
import Cookies from "./pages/Cookies";
import Contact from "./pages/Contact";
import NotFound from "./pages/NotFound";
import ArtistPublicProfile from "./pages/ArtistPublicProfile";
import Artists from "./pages/Artists";
import MyLifestyleVideos from "./pages/MyLifestyleVideos";
import MyReplays from "./pages/MyReplays";
import Install from "./pages/Install";
import Competitions from "./pages/Competitions";
import CompetitionDetail from "./pages/CompetitionDetail";
import CompetitionLive from "./pages/CompetitionLive";
import CompetitionManagement from "./pages/CompetitionManagement";
import LivePopupNotification from "@/components/notifications/LivePopupNotification";

const queryClient = new QueryClient();

const AnimatedRoutes = () => {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<PageTransition><Index /></PageTransition>} />
        <Route path="/auth" element={<PageTransition><Auth /></PageTransition>} />
        <Route path="/profile" element={<PageTransition><Profile /></PageTransition>} />
        <Route path="/admin" element={<PageTransition><Admin /></PageTransition>} />
        <Route path="/duel-management" element={<PageTransition><DuelManagement /></PageTransition>} />
        <Route path="/wallet" element={<PageTransition><WalletRecharge /></PageTransition>} />
        <Route path="/duels" element={<PageTransition><Duels /></PageTransition>} />
        <Route path="/duel/:id" element={<PageTransition><DuelLive /></PageTransition>} />
        {/* Vue interne, sans chrome, utilisée UNIQUEMENT par le navigateur headless de l'egress
            serveur pour enregistrer un duel composite (voir recording.service.js) — pas de
            <PageTransition/> (inutile ici, et évite tout délai d'animation avant que la vidéo
            ne s'affiche). Jetons LiveKit passés en query string (voir buildDuelRecordingUrl). */}
        <Route path="/duel/:id/recording-view" element={<DuelRecordingView />} />
        <Route path="/lives" element={<PageTransition><Lives /></PageTransition>} />
        <Route path="/live/:id" element={<PageTransition><LiveStream /></PageTransition>} />
        {/* Vue interne, sans chrome, utilisée UNIQUEMENT par le navigateur headless de l'egress
            serveur pour enregistrer un live composite avec ses invités (voir
            recording.service.js) — pas de <PageTransition/> (évite tout délai d'animation avant
            que la vidéo ne s'affiche). Jetons LiveKit passés en query string. */}
        <Route path="/live/:id/recording-view" element={<LiveRecordingView />} />
        <Route path="/concerts" element={<PageTransition><Concerts /></PageTransition>} />
        <Route path="/concert/:id" element={<PageTransition><ConcertDetail /></PageTransition>} />
        <Route path="/concert/:id/live" element={<PageTransition><ConcertLive /></PageTransition>} />
        <Route path="/lifestyle" element={<PageTransition><Lifestyle /></PageTransition>} />
        <Route path="/my-videos" element={<PageTransition><MyLifestyleVideos /></PageTransition>} />
        <Route path="/video/:id" element={<PageTransition><VideoDetail /></PageTransition>} />
        <Route path="/replays" element={<PageTransition><Replays /></PageTransition>} />
        <Route path="/my-replays" element={<PageTransition><MyReplays /></PageTransition>} />
        <Route path="/replay/:id" element={<PageTransition><ReplayDetail /></PageTransition>} />
        <Route path="/gift-shop" element={<PageTransition><GiftShop /></PageTransition>} />
        <Route path="/transactions" element={<PageTransition><Transactions /></PageTransition>} />
        <Route path="/technical-doc" element={<PageTransition><TechnicalDoc /></PageTransition>} />
        <Route path="/user-guide" element={<PageTransition><UserGuide /></PageTransition>} />
        <Route path="/help" element={<PageTransition><HelpCenter /></PageTransition>} />
        <Route path="/pricing" element={<PageTransition><Pricing /></PageTransition>} />
        <Route path="/blog" element={<PageTransition><Blog /></PageTransition>} />
        <Route path="/blog/:id" element={<PageTransition><BlogDetail /></PageTransition>} />
        <Route path="/leaderboard" element={<PageTransition><Leaderboard /></PageTransition>} />
        <Route path="/api" element={<PageTransition><ApiDocs /></PageTransition>} />
        <Route path="/terms" element={<PageTransition><Terms /></PageTransition>} />
        <Route path="/privacy" element={<PageTransition><Privacy /></PageTransition>} />
        <Route path="/cookies" element={<PageTransition><Cookies /></PageTransition>} />
        <Route path="/contact" element={<PageTransition><Contact /></PageTransition>} />
        <Route path="/artists" element={<PageTransition><Artists /></PageTransition>} />
        <Route path="/artist/:id" element={<PageTransition><ArtistPublicProfile /></PageTransition>} />
        <Route path="/install" element={<PageTransition><Install /></PageTransition>} />
        <Route path="/competitions" element={<PageTransition><Competitions /></PageTransition>} />
        <Route path="/competition/:id" element={<PageTransition><CompetitionDetail /></PageTransition>} />
        <Route path="/competition/:id/live" element={<PageTransition><CompetitionLive /></PageTransition>} />
        <Route path="/competition-management" element={<PageTransition><CompetitionManagement /></PageTransition>} />
        <Route path="*" element={<PageTransition><NotFound /></PageTransition>} />
      </Routes>
    </AnimatePresence>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <LanguageProvider>
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <ScrollToTop />
              <LivePopupNotification />
              <AnimatedRoutes />
            </BrowserRouter>
          </TooltipProvider>
        </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;