import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "@/components/ui/dialog";
import { X } from "lucide-react";
import { Button } from "./button";

interface ImageZoomDialogProps {
  src: string;
  alt: string;
  children: React.ReactNode;
}

export const ImageZoomDialog = ({ src, alt, children }: ImageZoomDialogProps) => {
  if (!src) return <>{children}</>;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <div className="cursor-zoom-in">{children}</div>
      </DialogTrigger>
      <DialogContent className="max-w-[90vw] max-h-[90vh] p-0 border-0 bg-black/90 overflow-hidden">
        <div className="relative w-full h-full flex items-center justify-center p-4">
          <img
            src={src}
            alt={alt}
            className="max-w-full max-h-[85vh] object-contain rounded-lg"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
};
