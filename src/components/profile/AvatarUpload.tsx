/**
 * Upload avatar utilisateur vers bucket Storage, mise à jour `profiles.avatar_url`. Recadrage et compression côté client.
 */
import { useState } from "react";
import { Camera, Upload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { uploadFile } from "@/api/endpoints/uploads";
import * as users from "@/api/endpoints/users";
import { useToast } from "@/hooks/use-toast";

interface AvatarUploadProps {
  userId: string;
  currentAvatarUrl?: string | null;
  fallbackText?: string;
  onAvatarUpdated?: (url: string) => void;
  size?: "sm" | "md" | "lg";
}

export const AvatarUpload = ({
  userId,
  currentAvatarUrl,
  fallbackText = "U",
  onAvatarUpdated,
  size = "lg",
}: AvatarUploadProps) => {
  const [uploading, setUploading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(currentAvatarUrl);
  const { toast } = useToast();

  const sizeClasses = {
    sm: "w-16 h-16",
    md: "w-24 h-24",
    lg: "w-32 h-32",
  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast({
        title: "Format invalide",
        description: "Veuillez sélectionner une image",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "Fichier trop volumineux",
        description: "L'image ne doit pas dépasser 5MB",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);

    try {
      // Presign → PUT → confirm, then persist on the profile.
      const publicUrl = await uploadFile(file, "avatar");
      await users.updateMe({ avatar_url: publicUrl });

      setAvatarUrl(publicUrl);
      onAvatarUpdated?.(publicUrl);

      toast({
        title: "Photo mise à jour",
        description: "Votre photo de profil a été modifiée",
      });
    } catch (error: any) {
      console.error("Upload error:", error);
      toast({
        title: "Erreur",
        description: error.message || "Impossible de télécharger l'image",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="relative group">
      <Avatar className={`${sizeClasses[size]} ring-4 ring-background shadow-xl`}>
        <AvatarImage src={avatarUrl || ""} />
        <AvatarFallback className="text-2xl font-bold bg-gradient-to-r from-primary to-accent text-white">
          {fallbackText}
        </AvatarFallback>
      </Avatar>

      <label
        htmlFor="avatar-upload"
        className={`absolute inset-0 flex items-center justify-center bg-black/50 rounded-full cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity ${
          uploading ? "opacity-100" : ""
        }`}
      >
        {uploading ? (
          <Loader2 className="w-8 h-8 text-white animate-spin" />
        ) : (
          <Camera className="w-8 h-8 text-white" />
        )}
      </label>

      <input
        id="avatar-upload"
        type="file"
        accept="image/*"
        onChange={handleUpload}
        disabled={uploading}
        className="hidden"
      />

      <div className="absolute -bottom-2 -right-2 p-1 bg-primary rounded-full text-white shadow-lg">
        <Camera className="w-4 h-4" />
      </div>
    </div>
  );
};
