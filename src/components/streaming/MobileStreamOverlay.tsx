/**
 * Overlay UI mobile plein écran pour streams (live/duel/concert) : chat compact, cadeaux flottants, contrôles host. Utilise VisualViewport + safe-area-inset-bottom.
 */
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Heart, Send, Gift, Trophy, Users, X, Reply, Smile, Settings, UserPlus, Mic, MicOff, Video, VideoOff, LogOut, Pause, Play, Eye, EyeOff, Hand, Clock, FileText, Disc, Swords, MessageCircle, SwitchCamera, Megaphone, Ban, Lock } from "lucide-react";
import { FloatingHearts, useFloatingHearts } from "@/components/animations/FloatingHearts";
import { FloatingEmojis, EmojiReactionBar, useFloatingEmojis, type FloatingEmoji } from "@/components/animations/FloatingEmojis";

import { motion, AnimatePresence } from "framer-motion";
import { useIsMobile } from "@/hooks/use-mobile";
import { useLanguage } from "@/contexts/LanguageContext";

interface ChatMsg {
  id: string;
  user_id: string;
  message: string;
  created_at: string;
  user_name?: string;
  avatar_url?: string;
  parent_id?: string | null;
  reply_to_name?: string;
  reply_to_message?: string;
}

interface ArtistControlsConfig {
  isStreaming: boolean;
  isPaused: boolean;
  isCameraOn: boolean;
  isMicOn: boolean;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onToggleCamera: () => void;
  onToggleMic: () => void;
  onSwitchCamera?: () => void;
}

interface GuestSelfControlsConfig {
  hasStream: boolean;
  isMicOn: boolean;
  isCamOn: boolean;
  onToggleMic: () => void;
  onToggleCam: () => void;
  onStartMic: () => void;
  onStartCam: () => void;
  onLeave: () => void;
  onSwitchCamera?: () => void;
}

interface SpectatorJoinConfig {
  hasRequested: boolean;
  isGuest: boolean;
  onRequestJoin: () => void;
  onCancelRequest: () => void;
  onLeave: () => void;
}

interface MobileStreamOverlayProps {
  defaultHidden?: boolean;
  isLive: boolean;
  viewerCount: number;
  likes: number;
  onLike: () => void;
  chatMessages: ChatMsg[];
  onSendMessage: (msg: string, parentId?: string | null) => void;
  currentUserId: string | null;
  /** Current user can ban chatters / hide messages (host or an appointed moderator). Never grants the chat on/off toggle. */
  canModerate?: boolean;
  /** Called when `canModerate` taps the ban icon on someone else's message. */
  onBanUser?: (msg: ChatMsg) => void;
  /** True when the current viewer cannot send chat messages (banned, or host disabled chat). */
  chatDisabled?: boolean;
  /** Reason shown as placeholder / compose-button label when `chatDisabled` is true. */
  chatDisabledLabel?: string;
  hearts: { id: number; x: number; scale: number; color: string }[];
  floatingEmojis?: FloatingEmoji[];
  onEmojiReact?: (emoji: string) => void;
  addHeart: () => void;
  videoContainerRef: React.RefObject<HTMLElement>;
  giftPanelContent?: React.ReactNode;
  leaderboardContent?: React.ReactNode;
  extraControls?: React.ReactNode;
  title?: string;
  artistName?: string;
  badgeLabel?: string;
  isArtist?: boolean;
  artistControls?: ArtistControlsConfig;
  guestManagementContent?: React.ReactNode;
  activeGuestCount?: number;
  pendingGuestCount?: number;
  isGuest?: boolean;
  guestSelfControls?: GuestSelfControlsConfig;
  showGuestThumbnails?: boolean;
  onToggleThumbnails?: () => void;
  hasGuests?: boolean;
  spectatorJoin?: SpectatorJoinConfig;
  description?: string;
  onQuitLive?: () => void;
  maxVisibleMessages?: number;
  extraLeftControls?: React.ReactNode;
  rightTopContent?: React.ReactNode;
  focusedParticipantInfo?: { name: string; isMicOn: boolean; isCameraOn: boolean } | null;
  managerControlsContent?: React.ReactNode;
  votePanelContent?: React.ReactNode;
  recordingContent?: React.ReactNode;
  timerContent?: React.ReactNode;
  voteBarContent?: React.ReactNode;
  /** Sponsor ad trigger UI (shown inline left of the Like button). */
  sponsorAdContent?: React.ReactNode;
  /** Hide standalone quick-action icons on the left (mic/cam/pause/stop/switch) — kept only in the "Contrôles du Live" popup. Used for competitions to save space. */
  compactArtistControls?: boolean;
  /** Une bande de vignettes multi-cam (compétition en ligne, plusieurs candidats) est affichée
   *  en haut de l'écran par le composant vidéo sous-jacent — décale le rail gauche pour ne pas
   *  se superposer aux vignettes. */
  hasTopThumbnails?: boolean;
}

export const MobileStreamOverlay = ({
  defaultHidden,
  isLive,
  viewerCount,
  likes,
  onLike,
  chatMessages,
  onSendMessage,
  currentUserId,
  canModerate,
  onBanUser,
  chatDisabled,
  chatDisabledLabel,
  hearts,
  floatingEmojis: floatingEmojisProp,
  onEmojiReact,
  addHeart,
  videoContainerRef,
  giftPanelContent,
  leaderboardContent,
  extraControls,
  title,
  artistName,
  badgeLabel = "LIVE",
  isArtist,
  artistControls,
  guestManagementContent,
  activeGuestCount = 0,
  pendingGuestCount = 0,
  isGuest,
  guestSelfControls,
  showGuestThumbnails,
  onToggleThumbnails,
  hasGuests,
  spectatorJoin,
  description,
  onQuitLive,
  maxVisibleMessages = 15,
  extraLeftControls,
  rightTopContent,
  focusedParticipantInfo,
  managerControlsContent,
  votePanelContent,
  recordingContent,
  timerContent,
  voteBarContent,
  sponsorAdContent,
  compactArtistControls,
  hasTopThumbnails,
}: MobileStreamOverlayProps) => {
  const isMobile = useIsMobile();
  const { t } = useLanguage();
  const [newMessage, setNewMessage] = useState("");
  const [replyTo, setReplyTo] = useState<ChatMsg | null>(null);
  const [showEmojiBar, setShowEmojiBar] = useState(false);
  const [showChatEmoji, setShowChatEmoji] = useState(false);
  const [showGiftPanel, setShowGiftPanel] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showArtistPanel, setShowArtistPanel] = useState(false);
  const [showGuestMgmt, setShowGuestMgmt] = useState(false);
  const [showJoinPopup, setShowJoinPopup] = useState(false);
  const [showDescriptionPanel, setShowDescriptionPanel] = useState(false);
  const [showManagerControls, setShowManagerControls] = useState(false);
  const [showExtraControls, setShowExtraControls] = useState(false);
  const [showVotePanel, setShowVotePanel] = useState(false);
  const [showRecordingPanel, setShowRecordingPanel] = useState(false);
  const [showSponsorAdPanel, setShowSponsorAdPanel] = useState(false);
  const [hideOverlay, setHideOverlay] = useState(defaultHidden ?? false);
  const [showCommentPopup, setShowCommentPopup] = useState(false);
  const { emojis: localEmojis, addEmoji: addLocalEmoji } = useFloatingEmojis();
  const chatEndRef = useRef<HTMLDivElement>(null);
  const commentInputRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Prevent mobile keyboard from shifting the fullscreen layout
  // Only adjust when keyboard is actually open (viewport significantly smaller than window)
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const handleResize = () => {
      if (!overlayRef.current) return;
      const keyboardOpen = vv.height < window.innerHeight * 0.85;
      if (keyboardOpen) {
        overlayRef.current.style.height = `${vv.height}px`;
        overlayRef.current.style.transform = `translateY(${vv.offsetTop}px)`;
      } else {
        overlayRef.current.style.height = '';
        overlayRef.current.style.transform = '';
      }
    };

    vv.addEventListener("resize", handleResize);
    vv.addEventListener("scroll", handleResize);
    return () => {
      vv.removeEventListener("resize", handleResize);
      vv.removeEventListener("scroll", handleResize);
    };
  }, []);

  const closeAllPanels = () => {
    setShowGiftPanel(false);
    setShowLeaderboard(false);
    setShowArtistPanel(false);
    setShowGuestMgmt(false);
    setShowJoinPopup(false);
    setShowDescriptionPanel(false);
    setShowManagerControls(false);
    setShowExtraControls(false);
    setShowVotePanel(false);
    setShowRecordingPanel(false);
    setShowSponsorAdPanel(false);
  };

  const togglePanel = (
    panel: "gift" | "leaderboard" | "artist" | "guest" | "join" | "description" | "manager" | "extra" | "vote" | "recording" | "sponsorAd"
  ) => {
    const isOpen = {
      gift: showGiftPanel,
      leaderboard: showLeaderboard,
      artist: showArtistPanel,
      guest: showGuestMgmt,
      join: showJoinPopup,
      description: showDescriptionPanel,
      manager: showManagerControls,
      extra: showExtraControls,
      vote: showVotePanel,
      recording: showRecordingPanel,
      sponsorAd: showSponsorAdPanel,
    }[panel];

    closeAllPanels();
    if (isOpen) return;

    if (panel === "gift") setShowGiftPanel(true);
    if (panel === "leaderboard") setShowLeaderboard(true);
    if (panel === "artist") setShowArtistPanel(true);
    if (panel === "guest") setShowGuestMgmt(true);
    if (panel === "join") setShowJoinPopup(true);
    if (panel === "description") setShowDescriptionPanel(true);
    if (panel === "manager") setShowManagerControls(true);
    if (panel === "extra") setShowExtraControls(true);
    if (panel === "vote") setShowVotePanel(true);
    if (panel === "recording") setShowRecordingPanel(true);
    if (panel === "sponsorAd") setShowSponsorAdPanel(true);
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [chatMessages]);

  const handleSend = () => {
    if (!newMessage.trim() || chatDisabled) return;
    onSendMessage(newMessage.trim(), replyTo?.id || null);
    setNewMessage("");
    setReplyTo(null);
    setShowCommentPopup(false);
    // Dismiss keyboard immediately to prevent layout shift
    commentInputRef.current?.blur();
  };

  const openCommentPopup = () => {
    closeAllPanels();
    setShowCommentPopup(true);
    setTimeout(() => commentInputRef.current?.focus(), 100);
  };

  if (!isMobile) return null;

  const visibleMessages = chatMessages.slice(-maxVisibleMessages);

  if (hideOverlay) {
    return (
      <div className="absolute inset-0 z-30 pointer-events-none">
        <button
          onClick={() => setHideOverlay(false)}
          className="absolute top-3 right-3 z-50 w-10 h-10 rounded-full bg-background/30 backdrop-blur-sm flex items-center justify-center pointer-events-auto border border-border/30"
          title="Afficher l'interface"
        >
          <Eye className="w-5 h-5 text-foreground" />
        </button>
      </div>
    );
  }

  return (
    <div ref={overlayRef} className="absolute inset-0 z-30 pointer-events-none flex flex-col justify-end" style={{ overflow: 'hidden' }}>
      {/* Vote bar above top bar (duels) */}
      {voteBarContent && (
        <div className="absolute top-0 left-0 right-0 z-50 pointer-events-auto">
          {voteBarContent}
        </div>
      )}

      {/* Top bar */}
      <div className={`absolute ${voteBarContent ? 'top-8' : 'top-3'} left-3 right-3 flex items-center justify-between pointer-events-auto z-40`}>
        <div className="flex items-center gap-1.5">
          {isLive && (
            <Badge className="bg-destructive text-destructive-foreground animate-pulse text-xs px-2 py-0.5">
              {badgeLabel}
            </Badge>
          )}
          <Badge variant="outline" className="bg-background/30 backdrop-blur-sm text-foreground border-border/30 text-xs">
            <Users className="w-3 h-3 mr-1" /> {viewerCount}
          </Badge>
          <div className="bg-background/30 backdrop-blur-sm text-foreground px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1">
            <Heart className="w-3 h-3 fill-destructive text-destructive" /> {likes}
          </div>
        </div>
        {/* Center: timer or focused participant info */}
        <div className="flex items-center gap-1.5">
          {timerContent ? (
            <div className="flex-shrink-0">{timerContent}</div>
          ) : focusedParticipantInfo ? (
            <div className="flex items-center gap-1 bg-background/30 backdrop-blur-sm px-2 py-1 rounded-full">
              <span className="text-foreground text-xs font-semibold truncate max-w-[80px] sm:max-w-[120px]">{focusedParticipantInfo.name}</span>
              {focusedParticipantInfo.isMicOn ? <Mic className="w-3 h-3 text-green-400 shrink-0" /> : <MicOff className="w-3 h-3 text-destructive shrink-0" />}
              {focusedParticipantInfo.isCameraOn ? <Video className="w-3 h-3 text-green-400 shrink-0" /> : <VideoOff className="w-3 h-3 text-destructive shrink-0" />}
            </div>
          ) : null}
          {rightTopContent && <div className="flex items-center gap-1">{rightTopContent}</div>}
        </div>
      </div>

      {/* LEFT side vertical control icons — décalé sous la bande de vignettes multi-cam
          (compétition en ligne) quand elle est affichée, pour ne pas s'y superposer. */}
      <div
        className={`absolute left-3 ${voteBarContent ? 'top-[4.5rem]' : 'top-14'} flex flex-col gap-2 pointer-events-auto z-40`}
        style={hasTopThumbnails ? { top: voteBarContent ? '11rem' : 'calc(3.5rem + 4.75rem)' } : undefined}
      >
        {/* Hide ALL overlay button (X) */}
        <button
          onClick={() => setHideOverlay(true)}
          className="w-10 h-10 rounded-full bg-background/40 backdrop-blur-sm flex items-center justify-center border border-border/30"
          title="Masquer tout"
        >
          <X className="w-5 h-5 text-foreground" />
        </button>

        {/* Artist: settings icon (panneau complet) */}
        {isArtist && artistControls?.isStreaming && (
          <button
            onClick={() => togglePanel("artist")}
            className="w-10 h-10 rounded-full bg-background/40 backdrop-blur-sm flex items-center justify-center border border-border/30"
            title="Réglages"
          >
            <Settings className="w-5 h-5 text-foreground" />
          </button>
        )}

        {/* Artist quick-action controls — direct mic/cam/pause/stop/switch
            buttons exposed on the left rail (parité Duel mobile). */}
        {isArtist && artistControls?.isStreaming && !compactArtistControls && (
          <>
            <button
              onClick={artistControls.onToggleMic}
              className={`w-10 h-10 rounded-full flex items-center justify-center border border-border/30 backdrop-blur-sm ${artistControls.isMicOn ? 'bg-green-500/60' : 'bg-destructive/60'}`}
              title={artistControls.isMicOn ? 'Couper micro' : 'Activer micro'}
            >
              {artistControls.isMicOn ? <Mic className="w-5 h-5 text-white" /> : <MicOff className="w-5 h-5 text-white" />}
            </button>
            <button
              onClick={artistControls.onToggleCamera}
              className={`w-10 h-10 rounded-full flex items-center justify-center border border-border/30 backdrop-blur-sm ${artistControls.isCameraOn ? 'bg-green-500/60' : 'bg-destructive/60'}`}
              title={artistControls.isCameraOn ? 'Couper caméra' : 'Activer caméra'}
            >
              {artistControls.isCameraOn ? <Video className="w-5 h-5 text-white" /> : <VideoOff className="w-5 h-5 text-white" />}
            </button>
            {artistControls.onSwitchCamera && artistControls.isCameraOn && (
              <button
                onClick={artistControls.onSwitchCamera}
                className="w-10 h-10 rounded-full bg-secondary/60 backdrop-blur-sm flex items-center justify-center border border-border/30"
                title="Changer caméra"
              >
                <SwitchCamera className="w-5 h-5 text-white" />
              </button>
            )}
            {artistControls.isPaused ? (
              <button
                onClick={artistControls.onResume}
                className="w-10 h-10 rounded-full bg-green-600/70 backdrop-blur-sm flex items-center justify-center border border-border/30"
                title="Reprendre"
              >
                <Play className="w-5 h-5 text-white" />
              </button>
            ) : (
              <button
                onClick={artistControls.onPause}
                className="w-10 h-10 rounded-full bg-yellow-500/70 backdrop-blur-sm flex items-center justify-center border border-border/30"
                title="Pause"
              >
                <Pause className="w-5 h-5 text-white" />
              </button>
            )}
            <button
              onClick={artistControls.onStop}
              className="w-10 h-10 rounded-full bg-destructive/80 backdrop-blur-sm flex items-center justify-center border border-border/30"
              title="Arrêter le direct"
            >
              <LogOut className="w-5 h-5 text-white" />
            </button>
          </>
        )}

        {/* Artist: guest management icon with badge */}
        {isArtist && (
          <button
            onClick={() => togglePanel("guest")}
            className="relative w-10 h-10 rounded-full bg-background/40 backdrop-blur-sm flex items-center justify-center border border-border/30"
          >
            <UserPlus className="w-5 h-5 text-foreground" />
            {pendingGuestCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                {pendingGuestCount}
              </span>
            )}
            {activeGuestCount > 0 && (
              <span className={`absolute ${pendingGuestCount > 0 ? '-bottom-1' : '-top-1'} -left-1 bg-green-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1`}>
                {activeGuestCount}
              </span>
            )}
          </button>
        )}

        {/* Manager controls icon */}
        {managerControlsContent && (
          <button
            onClick={() => togglePanel("manager")}
            className="w-10 h-10 rounded-full bg-accent/40 backdrop-blur-sm flex items-center justify-center border border-accent/30"
            title="Contrôles Manager"
          >
            <Settings className="w-5 h-5 text-accent" />
          </button>
        )}

        {/* Guest self-controls — always show leave */}
        {isGuest && guestSelfControls && (
          <>
            {guestSelfControls.hasStream ? (
              <>
                <button
                  onClick={guestSelfControls.onToggleMic}
                  className={`w-10 h-10 rounded-full flex items-center justify-center border border-border/30 ${guestSelfControls.isMicOn ? 'bg-green-500/60' : 'bg-destructive/60'} backdrop-blur-sm`}
                >
                  {guestSelfControls.isMicOn ? <Mic className="w-5 h-5 text-white" /> : <MicOff className="w-5 h-5 text-white" />}
                </button>
                <button
                  onClick={guestSelfControls.onToggleCam}
                  className={`w-10 h-10 rounded-full flex items-center justify-center border border-border/30 ${guestSelfControls.isCamOn ? 'bg-green-500/60' : 'bg-destructive/60'} backdrop-blur-sm`}
                >
                  {guestSelfControls.isCamOn ? <Video className="w-5 h-5 text-white" /> : <VideoOff className="w-5 h-5 text-white" />}
                </button>
                {guestSelfControls.onSwitchCamera && guestSelfControls.isCamOn && (
                  <button
                    onClick={guestSelfControls.onSwitchCamera}
                    className="w-10 h-10 rounded-full bg-secondary/60 backdrop-blur-sm flex items-center justify-center border border-border/30"
                  >
                    <SwitchCamera className="w-5 h-5 text-white" />
                  </button>
                )}
              </>
            ) : (
              <>
                <button
                  onClick={guestSelfControls.onStartCam}
                  className="w-10 h-10 rounded-full bg-primary/60 backdrop-blur-sm flex items-center justify-center border border-border/30"
                >
                  <Video className="w-5 h-5 text-white" />
                </button>
                <button
                  onClick={guestSelfControls.onStartMic}
                  className="w-10 h-10 rounded-full bg-primary/60 backdrop-blur-sm flex items-center justify-center border border-border/30"
                >
                  <Mic className="w-5 h-5 text-white" />
                </button>
              </>
            )}
            {/* Always show leave for guests */}
            <button
              onClick={guestSelfControls.onLeave}
              className="w-10 h-10 rounded-full bg-destructive/70 backdrop-blur-sm flex items-center justify-center border border-border/30"
            >
              <LogOut className="w-5 h-5 text-white" />
            </button>
          </>
        )}

        {/* Spectator: join request popup trigger + always-visible quit */}
        {spectatorJoin && !spectatorJoin.isGuest && (
          <>
            <button
              onClick={() => togglePanel("join")}
              className={`w-10 h-10 rounded-full backdrop-blur-sm flex items-center justify-center border border-border/30 ${spectatorJoin.hasRequested ? 'bg-yellow-500/60 animate-pulse' : 'bg-primary/60'}`}
              title="Rejoindre le live"
            >
              {spectatorJoin.hasRequested ? <Clock className="w-5 h-5 text-white" /> : <Hand className="w-5 h-5 text-white" />}
            </button>
          </>
        )}

        {/* Quit icon — always visible for non-artist non-guest spectators */}
        {!isArtist && !isGuest && onQuitLive && (
          <button
            onClick={onQuitLive}
            className="w-10 h-10 rounded-full bg-destructive/70 backdrop-blur-sm flex items-center justify-center border border-border/30"
            title="Quitter le live"
          >
            <LogOut className="w-5 h-5 text-white" />
          </button>
        )}

        {/* Description icon */}
        {description && (
          <button
            onClick={() => togglePanel("description")}
            className="w-10 h-10 rounded-full bg-background/40 backdrop-blur-sm flex items-center justify-center border border-border/30"
            title="Description"
          >
            <FileText className="w-5 h-5 text-foreground" />
          </button>
        )}

        {/* Slot for the video filters trigger (rendered via portal from WebRTCHost / WebRTCDuelStream on mobile) */}
        <div id="mobile-video-filter-slot" className="contents" />

        {/* Toggle thumbnails — just below description */}
        {hasGuests && (
          <button
            onClick={onToggleThumbnails}
            className="w-10 h-10 rounded-full bg-background/40 backdrop-blur-sm flex items-center justify-center border border-border/30"
            title={showGuestThumbnails ? "Masquer vignettes" : "Afficher vignettes"}
          >
            {showGuestThumbnails ? <EyeOff className="w-5 h-5 text-foreground" /> : <Eye className="w-5 h-5 text-foreground" />}
          </button>
        )}

        {/* Sponsor ad management — manager (duels) / artist (concerts) */}
        {sponsorAdContent && (
          <button
            onClick={() => togglePanel("sponsorAd")}
            className="w-10 h-10 rounded-full bg-amber-500/60 backdrop-blur-sm flex items-center justify-center border border-amber-400/40"
            title="Gérer la publicité"
          >
            <Megaphone className="w-5 h-5 text-white" />
          </button>
        )}

        {/* Extra left controls (e.g. duel stream controls) */}
        {extraLeftControls}
      </div>

      {/* Floating emojis */}
      <FloatingEmojis emojis={floatingEmojisProp || localEmojis} />
      <FloatingHearts hearts={hearts} />

      {/* Overlay chat messages */}
      <div className="px-3 pb-1 space-y-1 overflow-y-auto overflow-x-hidden scrollbar-hidden pointer-events-auto w-[56%] max-w-[56%] min-w-[180px]" style={{ maxHeight: '35vh', minHeight: 0, flexShrink: 0, WebkitOverflowScrolling: 'touch' }}>
        <AnimatePresence initial={false}>
          {visibleMessages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="flex items-start gap-1.5 group"
            >
              <Avatar className="w-6 h-6 shrink-0">
                <AvatarImage src={msg.avatar_url || ""} />
                <AvatarFallback className="text-[9px] bg-primary/30 text-primary-foreground">
                  {msg.user_name?.charAt(0) || "U"}
                </AvatarFallback>
              </Avatar>
              <div className="bg-background/20 backdrop-blur-sm rounded-lg px-2 py-1 max-w-full overflow-x-hidden">
                {msg.reply_to_name && (
                  <div className="mb-1 flex max-w-full items-start gap-1 rounded-md border-l-2 border-primary/70 bg-background/15 px-1.5 py-1 text-[10px] text-primary/90">
                    <Reply className="mt-0.5 h-2.5 w-2.5 shrink-0" />
                    <div className="min-w-0">
                      <span className="block font-medium leading-none">{msg.reply_to_name}</span>
                      <span className="block max-w-[120px] truncate text-primary/70 leading-tight">{msg.reply_to_message}</span>
                    </div>
                  </div>
                )}
                <span className="text-[10px] font-bold text-primary mr-1">{msg.user_name}</span>
                <button
                  type="button"
                  onClick={() => { setReplyTo(msg); openCommentPopup(); }}
                  className="inline text-left text-[11px] text-foreground break-words whitespace-pre-wrap [overflow-wrap:anywhere] align-middle"
                >
                  {msg.message}
                </button>
              </div>
              {canModerate && msg.user_id !== currentUserId && (
                <button
                  type="button"
                  onClick={() => onBanUser?.(msg)}
                  className="shrink-0 mt-1.5 text-white/70 hover:text-destructive"
                  title="Bannir"
                >
                  <Ban className="w-3 h-3" />
                </button>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
        <div ref={chatEndRef} />
      </div>

      {/* Reply indicator - shown outside popup as a hint */}
      {replyTo && !showCommentPopup && (
        <div className="mx-3 mb-1 bg-background/40 backdrop-blur-sm rounded-lg px-3 py-1.5 flex items-center justify-between pointer-events-auto w-[56%] max-w-[56%] min-w-[180px]">
          <div className="flex items-center gap-1 text-xs text-muted-foreground truncate">
            <Reply className="w-3 h-3 text-primary" />
            <span className="font-medium text-primary">{replyTo.user_name}</span>
            <span className="truncate max-w-[150px]">{replyTo.message}</span>
          </div>
          <button onClick={() => setReplyTo(null)} className="text-muted-foreground">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Emoji reaction bar */}
      <AnimatePresence>
        {showEmojiBar && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="px-3 pb-2 pointer-events-auto"
          >
            <div className="bg-background/40 backdrop-blur-md rounded-2xl px-2 py-2 border border-border/20">
              <EmojiReactionBar
                compact
                onReact={(emoji) => {
                  addLocalEmoji(emoji);
                  onEmojiReact?.(emoji);
                }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom bar */}
      {currentUserId && (
        <div className="px-3 pointer-events-auto" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
          <div className="flex gap-2 items-center">
            <button
              onClick={chatDisabled ? undefined : openCommentPopup}
              disabled={chatDisabled}
              className={`flex-1 flex gap-2 items-center backdrop-blur-md rounded-full px-3 py-2 border ${chatDisabled ? "bg-background/10 border-border/10 opacity-60" : "bg-background/30 border-border/20"}`}
            >
              {chatDisabled ? (
                <Lock className="w-4 h-4 text-muted-foreground shrink-0" />
              ) : (
                <MessageCircle className="w-4 h-4 text-muted-foreground shrink-0" />
              )}
              <span className="text-sm text-muted-foreground truncate">{chatDisabled ? (chatDisabledLabel || "Chat désactivé") : "Message..."}</span>
            </button>

            <button
              onClick={() => { onLike(); addHeart(); }}
              className="w-10 h-10 rounded-full bg-background/20 backdrop-blur-sm flex items-center justify-center active:scale-90 transition-transform shrink-0"
            >
              <Heart className="w-5 h-5 text-destructive fill-destructive" />
            </button>

            <button
              onClick={() => setShowEmojiBar((v) => !v)}
              className="w-10 h-10 rounded-full bg-background/20 backdrop-blur-sm flex items-center justify-center active:scale-90 transition-transform shrink-0"
            >
              <Smile className="w-5 h-5 text-foreground" />
            </button>

            {giftPanelContent && (
              <button
                onClick={() => togglePanel("gift")}
                aria-label={t("sendGift") || "Envoyer un cadeau"}
                className="relative w-14 h-14 min-w-[44px] min-h-[44px] rounded-full bg-gradient-to-br from-primary/30 to-accent/30 backdrop-blur-sm ring-2 ring-primary/60 shadow-[0_0_20px_rgba(217,70,239,0.45)] flex items-center justify-center shrink-0 active:scale-90 transition-transform touch-manipulation"
                style={{ WebkitTapHighlightColor: "transparent" }}
              >
                <Gift className="w-7 h-7 text-primary drop-shadow" />
                <span className="absolute inset-0 rounded-full animate-ping bg-primary/20 pointer-events-none" />
              </button>
            )}

            {leaderboardContent && (
              <button
                onClick={() => togglePanel("leaderboard")}
                className="w-10 h-10 rounded-full bg-background/20 backdrop-blur-sm flex items-center justify-center shrink-0"
              >
                <Trophy className="w-5 h-5 text-yellow-500" />
              </button>
            )}

            {/* Vote panel button */}
            {votePanelContent && (
              <button
                onClick={() => togglePanel("vote")}
                className="w-10 h-10 rounded-full bg-background/20 backdrop-blur-sm flex items-center justify-center shrink-0"
              >
                <Swords className="w-5 h-5 text-accent" />
              </button>
            )}

            {/* Recording button (manager) */}
            {recordingContent && (
              <button
                onClick={() => togglePanel("recording")}
                className="w-10 h-10 rounded-full bg-background/20 backdrop-blur-sm flex items-center justify-center shrink-0"
              >
                <Disc className="w-5 h-5 text-destructive" />
              </button>
            )}

            {/* Extra controls (legacy fallback) */}
            {extraControls && !votePanelContent && !recordingContent && (
              <button
                onClick={() => togglePanel("extra")}
                className="w-10 h-10 rounded-full bg-background/20 backdrop-blur-sm flex items-center justify-center shrink-0"
              >
                <Disc className="w-5 h-5 text-destructive" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* ===== INLINE PANELS ===== */}

      {/* Join Request Popup */}
      <AnimatePresence>
        {showJoinPopup && spectatorJoin && (
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="absolute bottom-0 left-0 right-0 z-[100] bg-background rounded-t-2xl border-t border-border shadow-2xl pointer-events-auto"
          >
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <h3 className="text-lg font-semibold text-foreground">Rejoindre le live 🎤</h3>
              <button onClick={() => setShowJoinPopup(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-4 pb-6">
              {!spectatorJoin.hasRequested ? (
                <div className="text-center space-y-3">
                  <p className="text-sm text-muted-foreground">Envoyez une demande à l'artiste pour rejoindre le live en tant qu'invité.</p>
                  <Button
                    onClick={() => { spectatorJoin.onRequestJoin(); }}
                    className="w-full h-12 text-base"
                  >
                    <Hand className="w-5 h-5 mr-2" /> Demander à rejoindre
                  </Button>
                </div>
              ) : (
                <div className="text-center space-y-3">
                  <div className="flex items-center justify-center gap-2">
                    <Badge variant="outline" className="py-2 px-4 text-sm border-yellow-500 text-yellow-600">
                      <Clock className="w-4 h-4 mr-1" /> En attente
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">Votre demande a été envoyée. L'artiste doit l'accepter.</p>
                  <Button
                    onClick={() => { spectatorJoin.onCancelRequest(); }}
                    variant="destructive"
                    className="w-full h-12 text-base"
                  >
                    <X className="w-5 h-5 mr-2" /> Annuler la demande
                  </Button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Gift Panel (kept mounted so gift realtime + alerts stay active for everyone) */}
      {giftPanelContent && (
        <motion.div
          initial={false}
          animate={showGiftPanel ? { y: 0, opacity: 1 } : { y: "100%", opacity: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className={`absolute bottom-0 left-0 right-0 z-[100] bg-background rounded-t-2xl border-t border-border shadow-2xl ${showGiftPanel ? "pointer-events-auto" : "pointer-events-none"}`}
          aria-hidden={!showGiftPanel}
        >
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <h3 className="text-lg font-semibold text-foreground">Envoyer un cadeau 🎁</h3>
            <button onClick={() => setShowGiftPanel(false)} className="text-muted-foreground hover:text-foreground">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="px-4 pb-4 overflow-y-auto max-h-[45vh]">
            {giftPanelContent}
          </div>
        </motion.div>
      )}

      {/* Leaderboard Panel */}
      <AnimatePresence>
        {showLeaderboard && leaderboardContent && (
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="absolute bottom-0 left-0 right-0 z-[100] bg-background rounded-t-2xl border-t border-border shadow-2xl pointer-events-auto"
          >
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <h3 className="text-lg font-semibold text-foreground">Top Donateurs 🏆</h3>
              <button onClick={() => setShowLeaderboard(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-4 pb-4 overflow-y-auto max-h-[45vh]">
              {leaderboardContent}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Artist Controls Panel */}
      <AnimatePresence>
        {showArtistPanel && artistControls && (
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="absolute bottom-0 left-0 right-0 z-[100] bg-background rounded-t-2xl border-t border-border shadow-2xl pointer-events-auto"
          >
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <h3 className="text-lg font-semibold text-foreground">Contrôles du Live 🎛️</h3>
              <button onClick={() => setShowArtistPanel(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-4 pb-4 grid grid-cols-2 gap-3">
              {artistControls.isPaused ? (
                <Button onClick={() => { artistControls.onResume(); setShowArtistPanel(false); }} className="bg-green-600 hover:bg-green-700 text-white h-14">
                  <Play className="w-5 h-5 mr-2" /> Reprendre
                </Button>
              ) : (
                <Button onClick={() => { artistControls.onPause(); setShowArtistPanel(false); }} variant="outline" className="border-yellow-500 text-yellow-500 h-14">
                  <Pause className="w-5 h-5 mr-2" /> Pause
                </Button>
              )}
              <Button onClick={() => { artistControls.onStop(); setShowArtistPanel(false); }} variant="destructive" className="h-14">
                <X className="w-5 h-5 mr-2" /> Arrêter
              </Button>
              <Button
                onClick={artistControls.onToggleCamera}
                variant={artistControls.isCameraOn ? "secondary" : "outline"}
                className="h-14"
              >
                {artistControls.isCameraOn ? <Video className="w-5 h-5 mr-2" /> : <VideoOff className="w-5 h-5 mr-2" />}
                {artistControls.isCameraOn ? "Caméra ON" : "Caméra OFF"}
              </Button>
              <Button
                onClick={artistControls.onToggleMic}
                variant={artistControls.isMicOn ? "secondary" : "outline"}
                className="h-14"
              >
                {artistControls.isMicOn ? <Mic className="w-5 h-5 mr-2" /> : <MicOff className="w-5 h-5 mr-2" />}
                {artistControls.isMicOn ? "Micro ON" : "Micro OFF"}
              </Button>
              {artistControls.onSwitchCamera && (
                <Button onClick={artistControls.onSwitchCamera} variant="secondary" className="h-14 col-span-2">
                  <SwitchCamera className="w-5 h-5 mr-2" />
                  Retourner caméra
                </Button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Guest Management Panel */}
      <AnimatePresence>
        {showGuestMgmt && guestManagementContent && (
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="absolute bottom-0 left-0 right-0 z-[100] bg-background rounded-t-2xl border-t border-border shadow-2xl pointer-events-auto"
          >
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <h3 className="text-lg font-semibold text-foreground">Gestion des invités 👥</h3>
              <button onClick={() => setShowGuestMgmt(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-4 pb-4 overflow-y-auto max-h-[50vh]">
              {guestManagementContent}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sponsor Ad Panel */}
      <AnimatePresence>
        {showSponsorAdPanel && sponsorAdContent && (
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="absolute bottom-0 left-0 right-0 z-[100] bg-background rounded-t-2xl border-t border-border shadow-2xl pointer-events-auto"
          >
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <Megaphone className="w-5 h-5 text-amber-500" /> Gestion des publicités
              </h3>
              <button onClick={() => setShowSponsorAdPanel(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-4 pb-6 overflow-y-auto max-h-[45vh]">
              {sponsorAdContent}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Description Panel */}
      <AnimatePresence>
        {showDescriptionPanel && description && (
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="absolute bottom-0 left-0 right-0 z-[100] bg-background rounded-t-2xl border-t border-border shadow-2xl pointer-events-auto"
          >
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <h3 className="text-lg font-semibold text-foreground">À propos 📝</h3>
              <button onClick={() => setShowDescriptionPanel(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-4 pb-4 overflow-y-auto max-h-[45vh]">
              <div className="flex items-center gap-3 mb-3">
                <div>
                  <h4 className="font-bold text-foreground">{artistName}</h4>
                  <p className="text-sm text-muted-foreground">{title || "Live spontané"}</p>
                </div>
              </div>
              <p className="text-sm text-foreground whitespace-pre-wrap">{description}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Manager Controls Panel */}
      <AnimatePresence>
        {showManagerControls && managerControlsContent && (
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="absolute bottom-0 left-0 right-0 z-[100] bg-background rounded-t-2xl border-t border-border shadow-2xl pointer-events-auto"
          >
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <h3 className="text-lg font-semibold text-foreground">Contrôles Manager 🎛️</h3>
              <button onClick={() => setShowManagerControls(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-4 pb-4 overflow-y-auto max-h-[50vh]">
              {managerControlsContent}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Extra Controls Panel (Votes, Recording) */}
      <AnimatePresence>
        {showExtraControls && extraControls && (
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="absolute bottom-0 left-0 right-0 z-[100] bg-background rounded-t-2xl border-t border-border shadow-2xl pointer-events-auto"
          >
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <h3 className="text-lg font-semibold text-foreground">Votes & Contrôles ⚔️</h3>
              <button onClick={() => setShowExtraControls(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-4 pb-4 overflow-y-auto max-h-[50vh]">
              {extraControls}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Vote Panel */}
      <AnimatePresence>
        {showVotePanel && votePanelContent && (
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="absolute bottom-0 left-0 right-0 z-[100] bg-background rounded-t-2xl border-t border-border shadow-2xl pointer-events-auto"
          >
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <h3 className="text-lg font-semibold text-foreground">Voter ⚔️</h3>
              <button onClick={() => setShowVotePanel(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-4 pb-4 overflow-y-auto max-h-[50vh]">
              {votePanelContent}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Recording Panel (kept mounted so closing panel does NOT stop an active recording) */}
      {recordingContent && (
        <motion.div
          initial={false}
          animate={showRecordingPanel ? { y: 0, opacity: 1 } : { y: "100%", opacity: 0.98 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className={`absolute bottom-0 left-0 right-0 z-[100] bg-background rounded-t-2xl border-t border-border shadow-2xl ${showRecordingPanel ? "pointer-events-auto" : "pointer-events-none"}`}
          aria-hidden={!showRecordingPanel}
        >
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <h3 className="text-lg font-semibold text-foreground">Enregistrement 🔴</h3>
            <button onClick={() => setShowRecordingPanel(false)} className="text-muted-foreground hover:text-foreground">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="px-4 pb-4 overflow-y-auto max-h-[50vh]">
            {recordingContent}
          </div>
        </motion.div>
      )}

      {/* Comment Popup */}
      <AnimatePresence>
        {showCommentPopup && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[200] flex items-end pointer-events-auto"
            style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setShowCommentPopup(false);
                // Blur input to dismiss keyboard immediately
                commentInputRef.current?.blur();
              }
            }}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="w-full bg-background/95 backdrop-blur-md rounded-t-2xl border-t border-border shadow-2xl p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">💬 Commenter</h3>
                <button onClick={() => setShowCommentPopup(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {replyTo && (
                <div className="bg-muted/50 rounded-lg px-3 py-2 flex items-center justify-between">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground truncate">
                    <Reply className="w-3 h-3 text-primary" />
                    <span className="font-medium text-primary">{replyTo.user_name}</span>
                    <span className="truncate max-w-[200px]">{replyTo.message}</span>
                  </div>
                  <button onClick={() => setReplyTo(null)} className="text-muted-foreground">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}

              <div className="flex gap-2 items-center">
                <Input
                  ref={commentInputRef}
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSend()}
                  placeholder={chatDisabled ? (chatDisabledLabel || "Chat désactivé") : "Votre message..."}
                  maxLength={200}
                  autoFocus
                  disabled={chatDisabled}
                  className="flex-1 h-10 text-sm"
                />
                <button
                  onClick={() => setShowChatEmoji(v => !v)}
                  disabled={chatDisabled}
                  className="text-muted-foreground hover:text-foreground shrink-0 text-lg disabled:opacity-40"
                >
                  😀
                </button>
                <button
                  onClick={handleSend}
                  disabled={!newMessage.trim() || chatDisabled}
                  className="w-10 h-10 rounded-full bg-primary flex items-center justify-center disabled:opacity-50 shrink-0"
                >
                  <Send className="w-4 h-4 text-primary-foreground" />
                </button>
              </div>

              {/* Emoji picker inside popup */}
              <AnimatePresence>
                {showChatEmoji && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="flex flex-wrap gap-1 bg-muted/50 rounded-xl p-2"
                  >
                    {["😀","😂","❤️","🔥","👏","🎵","🎤","💯","😍","🙌","💪","🎉","😮","👀","✨","🥳"].map(e => (
                      <button key={e} onClick={() => { setNewMessage(prev => prev + e); setShowChatEmoji(false); }} className="text-xl hover:scale-125 transition-transform p-1">{e}</button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
