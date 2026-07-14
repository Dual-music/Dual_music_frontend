import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { uploadFile, type UploadCategory } from "@/api/endpoints/uploads";
import { ApiError } from "@/api/http";
import { useToast } from "@/hooks/use-toast";
import { Upload, X, Loader2, Video, Play } from "lucide-react";

interface VideoUploadProps {
  value?: string;
  onChange: (url: string, duration?: string) => void;
  label?: string;
  folder?: string;
  category?: UploadCategory;
  className?: string;
}

export const VideoUpload = ({
  value,
  onChange,
  label = "Vidéo",
  folder = "videos",
  category,
  className = ""
}: VideoUploadProps) => {
  const resolveCategory = (): UploadCategory => {
    if (category) return category;
    const f = folder.toLowerCase();
    if (f.includes("lifestyle")) return "lifestyle";
    if (f.includes("replay")) return "replay";
    if (f.includes("sponsor")) return "sponsor";
    return "video";
  };
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Check file size (max 100MB)
    if (file.size > 100 * 1024 * 1024) {
      toast({
        title: "Fichier trop volumineux",
        description: "La taille maximale est de 100 Mo",
        variant: "destructive",
      });
      return;
    }

    // Check file type
    if (!file.type.startsWith("video/")) {
      toast({
        title: "Format invalide",
        description: "Veuillez sélectionner un fichier vidéo",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);
    setProgress(0);

    try {
      // Simulate progress while the presign→PUT→confirm round-trip runs.
      const progressInterval = setInterval(() => {
        setProgress(prev => Math.min(prev + 10, 90));
      }, 500);

      let publicUrl: string;
      try {
        publicUrl = await uploadFile(file, resolveCategory());
      } finally {
        clearInterval(progressInterval);
        setProgress(100);
      }

      // Get video duration
      const videoElement = document.createElement('video');
      videoElement.preload = 'metadata';
      videoElement.src = URL.createObjectURL(file);
      
      videoElement.onloadedmetadata = () => {
        const duration = videoElement.duration;
        const minutes = Math.floor(duration / 60);
        const seconds = Math.floor(duration % 60);
        const formattedDuration = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        URL.revokeObjectURL(videoElement.src);
        onChange(publicUrl, formattedDuration);
      };
      
      videoElement.onerror = () => {
        URL.revokeObjectURL(videoElement.src);
        onChange(publicUrl);
      };

      toast({
        title: "Vidéo uploadée",
        description: "Votre vidéo a été uploadée avec succès",
      });
    } catch (error: any) {
      toast({
        title: "Erreur d'upload",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  const handleRemove = () => {
    onChange("");
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className={className}>
      <Label className="block mb-2">{label}</Label>
      
      {value ? (
        <div className="relative group">
          <video 
            src={value} 
            className="w-full h-40 object-cover rounded-lg border border-border"
            controls
          />
          <Button
            type="button"
            variant="destructive"
            size="icon"
            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={handleRemove}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      ) : (
        <div 
          className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Upload en cours... {progress}%</p>
              <div className="w-full max-w-xs bg-muted rounded-full h-2">
                <div 
                  className="bg-primary h-2 rounded-full transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Video className="w-8 h-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Cliquez pour uploader une vidéo
              </p>
              <p className="text-xs text-muted-foreground">
                Formats: MP4, MOV, AVI (max 100 Mo)
              </p>
            </div>
          )}
        </div>
      )}
      
      <Input
        ref={inputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={handleUpload}
        disabled={uploading}
      />
    </div>
  );
};
