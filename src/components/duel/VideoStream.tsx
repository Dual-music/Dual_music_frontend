/**
 * Composant vidéo générique (tuile d'un duelliste) : autoplay, muted local, indicateur de parole (`useAudioActivity`).
 */
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Camera, CameraOff, Mic, MicOff, Video, VideoOff, SwitchCamera } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

interface VideoStreamProps {
  userId: string;
  roomId: string;
  isMain: boolean;
}

const VideoStream = ({ userId, roomId, isMain }: VideoStreamProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isVideoEnabled, setIsVideoEnabled] = useState(false);
  const [isAudioEnabled, setIsAudioEnabled] = useState(false);
  const [canControl, setCanControl] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const { toast } = useToast();
  const { user, roles } = useAuth();

  useEffect(() => {
    if (!user) return;

    // Check if user is the stream owner
    if (user.id === userId) {
      setCanControl(true);
    }

    // Check user role (from the auth session)
    const roleList = roles as string[];
    if (roleList.length > 0) {
      if (roleList.includes("artist") || roleList.includes("manager")) {
        setUserRole(roleList[0]);
        // Artists and managers can control their own stream
        if (user.id === userId) {
          setCanControl(true);
        }
      }
    }
  }, [userId, user, roles]);

  const startStream = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      });

      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      setIsVideoEnabled(true);
      setIsAudioEnabled(true);
      
      toast({
        title: "Caméra activée",
        description: "Votre flux vidéo est maintenant actif",
      });
    } catch (error: any) {
      console.error("Error accessing media devices:", error);
      toast({
        title: "Erreur",
        description: error.message || "Impossible d'accéder à la caméra",
        variant: "destructive",
      });
    }
  };

  const toggleVideo = () => {
    if (stream) {
      const videoTrack = stream.getVideoTracks()[0];
      videoTrack.enabled = !videoTrack.enabled;
      setIsVideoEnabled(videoTrack.enabled);
    }
  };

  const toggleAudio = () => {
    if (stream) {
      const audioTrack = stream.getAudioTracks()[0];
      audioTrack.enabled = !audioTrack.enabled;
      setIsAudioEnabled(audioTrack.enabled);
    }
  };

  const stopStream = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
      setIsVideoEnabled(false);
      setIsAudioEnabled(false);
    }
  };

  const switchCamera = async () => {
    if (!stream) return;
    const newFacingMode = facingMode === 'user' ? 'environment' : 'user';
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: newFacingMode }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      });
      // Preserve audio state
      newStream.getAudioTracks().forEach(t => { t.enabled = isAudioEnabled; });
      // Stop old tracks
      stream.getTracks().forEach(t => t.stop());
      setStream(newStream);
      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
      }
      setFacingMode(newFacingMode);
      setIsVideoEnabled(true);
    } catch (error: any) {
      console.error("Error switching camera:", error);
      toast({
        title: "Erreur",
        description: "Impossible de basculer la caméra",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    return () => {
      stopStream();
    };
  }, []);

  return (
    <div className="relative w-full h-full bg-muted">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={!isMain}
        className="w-full h-full object-cover"
      />

      {!stream && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-background/90 to-background/70">
          <div className="text-center">
            <div className="w-24 h-24 rounded-full bg-muted mx-auto mb-4 flex items-center justify-center">
              <Camera className="w-12 h-12 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground mb-4">
              {canControl ? "Caméra désactivée" : "En attente..."}
            </p>
          </div>
        </div>
      )}

      {canControl && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
          {!stream ? (
            <Button
              onClick={startStream}
              className="bg-primary hover:bg-primary/90"
            >
              <Camera className="w-4 h-4 mr-2" />
              Activer la caméra
            </Button>
          ) : (
            <>
              <Button
                onClick={switchCamera}
                variant="secondary"
                size="icon"
                title="Retourner la caméra"
              >
                <SwitchCamera className="w-4 h-4" />
              </Button>
              <Button
                onClick={toggleVideo}
                variant={isVideoEnabled ? "secondary" : "destructive"}
                size="icon"
              >
                {isVideoEnabled ? (
                  <Camera className="w-4 h-4" />
                ) : (
                  <CameraOff className="w-4 h-4" />
                )}
              </Button>
              <Button
                onClick={toggleAudio}
                variant={isAudioEnabled ? "secondary" : "destructive"}
                size="icon"
              >
                {isAudioEnabled ? (
                  <Mic className="w-4 h-4" />
                ) : (
                  <MicOff className="w-4 h-4" />
                )}
              </Button>
              <Button onClick={stopStream} variant="destructive" size="icon">
                <CameraOff className="w-4 h-4" />
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default VideoStream;
