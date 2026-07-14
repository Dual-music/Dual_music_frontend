/**
 * Upload vidéo lifestyle artiste : court VOD, stockage Supabase Storage bucket `lifestyle`,
 * insert `lifestyle_videos`. Limite 60s.
 */
import { useState } from "react";
import { createVideo } from "@/api/endpoints/lifestyle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Upload, Video, X, Loader2 } from "lucide-react";
import { ImageUpload } from "@/components/ui/image-upload";
import { VideoUpload } from "@/components/ui/video-upload";

interface LifestyleVideoUploadProps {
  artistId: string;
  artistName: string;
  onSuccess?: () => void;
}

export const LifestyleVideoUpload = ({ artistId, artistName, onSuccess }: LifestyleVideoUploadProps) => {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [duration, setDuration] = useState("");
  const [uploading, setUploading] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title || !videoUrl || !duration) {
      toast({
        title: "Champs requis",
        description: "Veuillez remplir tous les champs obligatoires.",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);

    try {
      await createVideo({
        artist_id: artistId,
        artist_name: artistName,
        title,
        description,
        video_url: videoUrl,
        thumbnail_url: thumbnailUrl || null,
        duration,
      });

      toast({
        title: "Vidéo publiée ! 🎬",
        description: "Votre vidéo lifestyle est maintenant visible.",
      });

      // Reset form
      setTitle("");
      setDescription("");
      setVideoUrl("");
      setThumbnailUrl("");
      setDuration("");
      setShowForm(false);
      
      onSuccess?.();
    } catch (error) {
      console.error("Error uploading video:", error);
      toast({
        title: "Erreur",
        description: "Impossible de publier la vidéo.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  if (!showForm) {
    return (
      <Button
        onClick={() => setShowForm(true)}
        className="w-full bg-gradient-to-r from-purple-500 to-pink-500 text-white"
      >
        <Upload className="w-4 h-4 mr-2" />
        Publier une nouvelle vidéo
      </Button>
    );
  }

  return (
    <Card className="border-purple-500/20">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Video className="w-5 h-5 text-purple-500" />
            Nouvelle Vidéo Lifestyle
          </CardTitle>
          <CardDescription>
            Partagez du contenu exclusif avec vos fans
          </CardDescription>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setShowForm(false)}>
          <X className="w-4 h-4" />
        </Button>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Titre *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Mon titre de vidéo"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Décrivez votre vidéo..."
              rows={3}
            />
          </div>

          <VideoUpload
            value={videoUrl}
            onChange={(url, detectedDuration) => {
              setVideoUrl(url);
              if (detectedDuration && !duration) {
                setDuration(detectedDuration);
              }
            }}
            label="Vidéo *"
            folder="lifestyle-videos"
          />

          <ImageUpload
            value={thumbnailUrl}
            onChange={(url) => setThumbnailUrl(url)}
            label="Miniature de la vidéo"
            folder="thumbnails"
          />

          <div className="space-y-2">
            <Label htmlFor="duration">Durée *</Label>
            <Input
              id="duration"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder="3:45"
              required
            />
            <p className="text-xs text-muted-foreground">
              Format: minutes:secondes (ex: 3:45)
            </p>
          </div>

          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowForm(false)}
              className="flex-1"
            >
              Annuler
            </Button>
            <Button
              type="submit"
              disabled={uploading}
              className="flex-1 bg-gradient-to-r from-purple-500 to-pink-500"
            >
              {uploading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Publication...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Publier
                </>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};

export default LifestyleVideoUpload;