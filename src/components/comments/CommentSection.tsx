/**
 * Section commentaires VOD (replays/lifestyle) : insert `comments`, replies, likes. Auth requise
 * via `AuthRequiredDialog`.
 */
import { useState, useEffect } from "react";
import { listComments, createComment, deleteComment, toggleLike } from "@/api/endpoints/comments";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Heart, MessageCircle, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useLanguage } from "@/contexts/LanguageContext";
import { motion, AnimatePresence } from "framer-motion";

interface Comment {
  id: string;
  user_id: string;
  content: string;
  parent_id: string | null;
  likes_count: number;
  created_at: string;
  profile?: {
    full_name: string | null;
    avatar_url: string | null;
  };
  replies?: Comment[];
  hasLiked?: boolean;
}

interface CommentSectionProps {
  contentType: "duel" | "live" | "lifestyle" | "blog" | "replay";
  contentId: string;
}

const CommentSection = ({ contentType, contentId }: CommentSectionProps) => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const currentUser = user?.id ?? null;
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchComments = async () => {
    let data: Array<Record<string, unknown>>;
    try {
      // Flat list already includes likes_count + per-caller `liked` + author profile.
      data = await listComments(contentType, contentId);
    } catch (error) {
      console.error("Error fetching comments:", error);
      return;
    }

    // Organize comments with replies (tree built client-side from parent_id).
    const commentsMap = new Map<string, Comment>();
    const rootComments: Comment[] = [];

    data.forEach(raw => {
      const comment = raw as unknown as Comment & { liked?: boolean };
      const enrichedComment: Comment = {
        ...comment,
        likes_count: comment.likes_count || 0,
        profile: comment.profile || { full_name: null, avatar_url: null },
        replies: [],
        hasLiked: comment.liked ?? false
      };
      commentsMap.set(enrichedComment.id, enrichedComment);
    });

    data.forEach(raw => {
      const comment = raw as unknown as Comment;
      const enrichedComment = commentsMap.get(comment.id)!;
      if (comment.parent_id && commentsMap.has(comment.parent_id)) {
        commentsMap.get(comment.parent_id)!.replies!.push(enrichedComment);
      } else if (!comment.parent_id) {
        rootComments.push(enrichedComment);
      }
    });

    setComments(rootComments);
  };

  useEffect(() => {
    // realtime removed (no backend emit); data loads on mount + on action.
    fetchComments();
  }, [contentType, contentId, currentUser]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    
    if (!currentUser) {
      toast.error(t("pleaseLogin"));
      return;
    }

    setIsLoading(true);
    try {
      await createComment({
        contentType,
        contentId,
        content: newComment.trim(),
        parentId: replyTo?.id,
      });
      setNewComment("");
      setReplyTo(null);
      toast.success(t("commentPosted"));
      fetchComments();
    } catch (error) {
      console.error("Comment insert error:", error);
      toast.error(t("commentError"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleLike = async (commentId: string, _hasLiked: boolean) => {
    if (!currentUser) {
      toast.error(t("pleaseLogin"));
      return;
    }

    try {
      await toggleLike(commentId);
    } finally {
      fetchComments();
    }
  };

  const handleDelete = async (commentId: string) => {
    try {
      await deleteComment(commentId);
      toast.success(t("commentDeleted"));
      fetchComments();
    } catch (error) {
      toast.error(t("deleteError"));
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (diff < 60) return `${diff}s`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    return `${Math.floor(diff / 86400)}j`;
  };

  const CommentItem = ({ comment, isReply = false }: { comment: Comment; isReply?: boolean }) => (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={`flex gap-3 ${isReply ? "ml-10 mt-2" : ""}`}
    >
      <Avatar className="w-8 h-8 flex-shrink-0">
        <AvatarImage src={comment.profile?.avatar_url || undefined} />
        <AvatarFallback className="bg-primary/20 text-primary text-xs">
          {comment.profile?.full_name?.[0]?.toUpperCase() || "U"}
        </AvatarFallback>
      </Avatar>
      
      <div className="flex-1 min-w-0">
        <div className="bg-muted/50 rounded-xl px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm text-foreground">
              {comment.profile?.full_name || "Utilisateur"}
            </span>
            <span className="text-xs text-muted-foreground">{formatTime(comment.created_at)}</span>
          </div>
          <p className="text-sm text-foreground/90 break-words">{comment.content}</p>
        </div>
        
        <div className="flex items-center gap-4 mt-1 ml-2">
          <button
            onClick={() => handleLike(comment.id, comment.hasLiked || false)}
            className={`flex items-center gap-1 text-xs transition-colors ${
              comment.hasLiked ? "text-destructive" : "text-muted-foreground hover:text-destructive"
            }`}
          >
            <Heart className={`w-3.5 h-3.5 ${comment.hasLiked ? "fill-current" : ""}`} />
            <span>{comment.likes_count || 0}</span>
          </button>
          
          {!isReply && (
            <button
              onClick={() => setReplyTo({ id: comment.id, name: comment.profile?.full_name || "Utilisateur" })}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              <span>{comment.replies?.length || 0}</span>
              {t("reply")}
            </button>
          )}
          
          {currentUser === comment.user_id && (
            <button
              onClick={() => handleDelete(comment.id)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        
        {/* Replies */}
        {comment.replies && comment.replies.length > 0 && (
          <div className="mt-2 space-y-2">
            {comment.replies.map(reply => (
              <CommentItem key={reply.id} comment={reply} isReply />
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );

  return (
    <div className="bg-card rounded-lg border border-border p-4 space-y-4">
      <h3 className="font-semibold text-foreground flex items-center gap-2">
        <MessageCircle className="w-5 h-5 text-primary" />
        {t("comments")} ({comments.length})
      </h3>
      
      {/* Comment input */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="flex-1 relative">
          {replyTo && (
            <div className="absolute -top-6 left-0 text-xs text-primary flex items-center gap-1">
              {t("replyingTo")} {replyTo.name}
              <button
                type="button"
                onClick={() => setReplyTo(null)}
                className="text-muted-foreground hover:text-foreground ml-1"
              >
                ✕
              </button>
            </div>
          )}
          <Input
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder={t("writeComment")}
            className="bg-muted/50 border-border"
            disabled={!currentUser}
          />
        </div>
        <Button type="submit" size="icon" disabled={isLoading || !currentUser}>
          <Send className="w-4 h-4" />
        </Button>
      </form>
      
      {/* Comments list */}
      <div className="space-y-4 max-h-96 overflow-y-auto">
        <AnimatePresence>
          {comments.length > 0 ? (
            comments.map(comment => (
              <CommentItem key={comment.id} comment={comment} />
            ))
          ) : (
            <p className="text-center text-muted-foreground text-sm py-4">
              {t("noComments")}
            </p>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default CommentSection;