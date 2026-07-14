import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { uploadFile, type UploadCategory } from "@/api/endpoints/uploads";
import { ApiError } from "@/api/http";
import { useToast } from "@/hooks/use-toast";
import { Upload, X, Loader2 } from "lucide-react";

interface ImageUploadProps {
  value?: string;
  onChange: (url: string) => void;
  label?: string;
  folder?: string;
  category?: UploadCategory;
  accept?: string;
  className?: string;
}

/** Maps a legacy storage `folder` name to a backend upload category. */
function folderToCategory(folder: string, fallback: UploadCategory): UploadCategory {
  const f = folder.toLowerCase();
  if (f.includes("avatar")) return "avatar";
  if (f.includes("sponsor")) return "sponsor";
  if (f.includes("lifestyle")) return "lifestyle";
  if (f.includes("replay")) return "replay";
  return fallback;
}

export const ImageUpload = ({
  value,
  onChange,
  label = "Image",
  folder = "images",
  category,
  accept = "image/*",
  className = ""
}: ImageUploadProps) => {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);

    try {
      const publicUrl = await uploadFile(file, category ?? folderToCategory(folder, "image"));
      onChange(publicUrl);

      toast({
        title: "Fichier uploadé",
        description: "Votre fichier a été uploadé avec succès",
      });
    } catch (error: any) {
      toast({
        title: "Erreur d'upload",
        description: error instanceof ApiError ? error.message : String(error?.message ?? error),
        variant: "destructive",
      });
    } finally {
      setUploading(false);
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
          <img 
            src={value} 
            alt="Aperçu" 
            className="w-full h-40 object-cover rounded-lg border border-border"
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
              <p className="text-sm text-muted-foreground">Upload en cours...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Upload className="w-8 h-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Cliquez pour uploader ou glissez un fichier
              </p>
            </div>
          )}
        </div>
      )}
      
      <Input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={handleUpload}
        disabled={uploading}
      />
    </div>
  );
};