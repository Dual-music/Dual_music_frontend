/**
 * Admin: BlogManager — CRUD des articles de blog (table `blog_posts`).
 *
 * Création/édition/publication d'articles bilingues (FR/EN), gestion des
 * slugs, images de couverture, statut publié/brouillon. Affiché publiquement
 * sur `/blog` et `/blog/:slug`.
 *
 * @access  role=admin
 */
import { useEffect, useState } from "react";
import { listBlogs, createBlog, updateBlog, deleteBlog } from "@/api/endpoints/blogs";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ImageUpload } from "@/components/ui/image-upload";
import { AdminTable } from "@/components/admin/AdminTable";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { useUiPreferences } from "@/hooks/useUiPreferences";
import { formatTz } from "@/lib/datetime";
import { Plus, Edit, Trash2 } from "lucide-react";

interface Blog {
  id: string;
  title: string;
  content: string;
  excerpt: string | null;
  image_url: string | null;
  category: string;
  author_name: string;
  published: boolean;
  created_at: string;
}

export const BlogManager = () => {
  const { toast } = useToast();
  const { user, profile } = useAuth();
  const { t, language } = useLanguage();
  const { prefs } = useUiPreferences();
  const tz = prefs.timezone;
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const [blogs, setBlogs] = useState<Blog[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingBlog, setEditingBlog] = useState<Blog | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState({ title: "", content: "", excerpt: "", image_url: "", category: "news", published: false });

  useEffect(() => { fetchBlogs(); }, []);

  const fetchBlogs = async () => {
    try {
      const data = await listBlogs({ published: "all" });
      setBlogs(data as unknown as Blog[]);
    } catch (error) {
      console.error("Error loading blogs:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!user) return;
    const blogData = { ...formData, author_id: user.id, author_name: profile?.full_name || user.email || "Admin" };

    try {
      if (editingBlog) {
        await updateBlog(editingBlog.id, blogData);
        toast({ title: t("adminBlogUpdated") }); resetForm(); fetchBlogs();
      } else {
        await createBlog(blogData);
        toast({ title: t("adminBlogCreated") }); resetForm(); fetchBlogs();
      }
    } catch (error) {
      toast({ title: t("error"), description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    }
  };

  const handleDelete = (id: string, title: string) => {
    confirm({
      title: t("adminBlogDeleteConfirm"),
      description: `"${title}" ${t("adminBlogDeleteDesc")}`,
      confirmLabel: t("adminBlogDeleteBtn"),
      cancelLabel: t("cancel"),
      variant: "destructive",
      onConfirm: async () => {
        try {
          await deleteBlog(id);
          toast({ title: t("adminBlogDeleted") }); fetchBlogs();
        } catch (error) {
          toast({ title: t("error"), description: error instanceof Error ? error.message : String(error), variant: "destructive" });
        }
      }
    });
  };

  const handleEdit = (blog: Blog) => {
    setEditingBlog(blog);
    setFormData({ title: blog.title, content: blog.content, excerpt: blog.excerpt || "", image_url: blog.image_url || "", category: blog.category, published: blog.published });
    setIsDialogOpen(true);
  };

  const resetForm = () => {
    setEditingBlog(null);
    setFormData({ title: "", content: "", excerpt: "", image_url: "", category: "news", published: false });
    setIsDialogOpen(false);
  };

  const fmt = (dt: string) => formatTz(dt, "dd MMM yyyy", { timezone: tz, language });

  return (
    <Card>
      {confirmDialog}
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{t("adminBlogTitle")}</CardTitle>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => resetForm()}><Plus className="w-4 h-4 mr-2" />{t("adminBlogNew")}</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingBlog ? t("adminBlogEditTitle") : t("adminBlogNewTitle")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div><Label>{t("adminBlogTitleField")}</Label><Input value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} placeholder={t("adminBlogTitlePlaceholder")} /></div>
              <ImageUpload value={formData.image_url} onChange={(url) => setFormData({ ...formData, image_url: url })} label={t("adminBlogCoverImage")} folder="blog" />
              <div><Label>{t("adminBlogCategory")}</Label><Input value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })} placeholder={t("adminBlogCategoryPlaceholder")} /></div>
              <div><Label>{t("adminBlogExcerpt")}</Label><Textarea value={formData.excerpt} onChange={(e) => setFormData({ ...formData, excerpt: e.target.value })} placeholder={t("adminBlogExcerptPlaceholder")} rows={2} /></div>
              <div><Label>{t("adminBlogContent")}</Label><Textarea value={formData.content} onChange={(e) => setFormData({ ...formData, content: e.target.value })} placeholder={t("adminBlogContentPlaceholder")} rows={10} /></div>
              <div className="flex items-center gap-2">
                <Switch checked={formData.published} onCheckedChange={(checked) => setFormData({ ...formData, published: checked })} />
                <Label>{t("adminBlogPublishNow")}</Label>
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={resetForm}>{t("adminBlogCancel")}</Button>
                <Button onClick={handleSubmit}>{editingBlog ? t("adminBlogUpdate") : t("adminBlogCreate")}</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <AdminTable
          data={blogs}
          searchKeys={["title", "author_name", "category"]}
          emptyMessage={t("adminBlogNoArticle")}
          columns={[
            { key: "title", label: t("adminBlogColTitle"), sortable: true, render: (b) => <span className="font-medium max-w-xs truncate block">{b.title}</span> },
            { key: "category", label: t("adminBlogColCategory"), sortable: true, render: (b) => <Badge variant="secondary">{b.category}</Badge> },
            { key: "author_name", label: t("adminBlogColAuthor"), sortable: true },
            { key: "created_at", label: t("adminBlogColDate"), sortable: true, render: (b) => fmt(b.created_at) },
            { key: "published", label: t("adminBlogColStatus"), sortable: true, render: (b) => <Badge variant={b.published ? "default" : "outline"}>{b.published ? t("adminBlogPublished") : t("adminBlogDraft")}</Badge> },
            { key: "actions", label: t("adminBlogColActions"), render: (blog) => (
              <div className="flex gap-2">
                <Button variant="outline" size="icon" onClick={() => handleEdit(blog)}><Edit className="w-4 h-4" /></Button>
                <Button variant="destructive" size="icon" onClick={() => handleDelete(blog.id, blog.title)}><Trash2 className="w-4 h-4" /></Button>
              </div>
            )}
          ]}
        />
      </CardContent>
    </Card>
  );
};
