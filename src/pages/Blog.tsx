import { useEffect, useState } from "react";
import SEO from "@/components/seo/SEO";
import { useNavigate } from "react-router-dom";
import { listBlogs } from "@/api/endpoints/blogs";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useLanguage } from "@/contexts/LanguageContext";
import { useUiPreferences } from "@/hooks/useUiPreferences";
import { formatTz } from "@/lib/datetime";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, User, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Blog {
  id: string;
  title: string;
  content: string;
  excerpt: string | null;
  image_url: string | null;
  category: string;
  author_name: string;
  created_at: string;
}

const Blog = () => {
  const { t, language } = useLanguage();
  const { prefs } = useUiPreferences();
  const tz = prefs.timezone;
  const navigate = useNavigate();
  const [articles, setArticles] = useState<Blog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBlogs = async () => {
      try {
        const data = await listBlogs();
        setArticles(data as unknown as Blog[]);
      } catch (error) {
        console.error("Error loading blogs:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchBlogs();
  }, []);

  const formatDate = (dateStr: string) =>
    formatTz(dateStr, "d MMMM yyyy", { timezone: tz, language });

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Chargement...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <SEO title="Blog — Dual Music" description="Actualités, interviews et coulisses de la scène musicale Dual Music." path="/blog" />
      <Header />
      
      <main className="container mx-auto px-4 pt-24 pb-16">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold bg-gradient-primary bg-clip-text text-transparent mb-4">
            {t("blogTitle")}
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            {t("blogSubtitle")}
          </p>
        </div>

        {articles.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-muted-foreground">Aucun article pour le moment.</p>
          </div>
        ) : (
          <>
            {/* Featured Article */}
            {articles[0] && (
              <Card className="bg-card border-border mb-12 overflow-hidden">
                <div className="grid md:grid-cols-2 gap-0">
                  <div 
                    className="aspect-video md:aspect-auto bg-cover bg-center min-h-[300px]"
                    style={{ backgroundImage: `url(${articles[0].image_url || "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=800"})` }}
                  />
                  <div className="p-8 flex flex-col justify-center">
                    <Badge className="w-fit mb-4">{articles[0].category}</Badge>
                    <h2 className="text-2xl font-bold text-foreground mb-4">
                      {articles[0].title}
                    </h2>
                    <p className="text-muted-foreground mb-6">{articles[0].excerpt || articles[0].content.substring(0, 150)}...</p>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground mb-6">
                      <span className="flex items-center gap-1">
                        <User className="w-4 h-4" />
                        {articles[0].author_name}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        {formatDate(articles[0].created_at)}
                      </span>
                    </div>
                    <Button className="w-fit" onClick={() => navigate(`/blog/${articles[0].id}`)}>
                      {t("readMore")} <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </div>
                </div>
              </Card>
            )}

            {/* Article Grid */}
            <div className="grid md:grid-cols-3 gap-6">
              {articles.slice(1).map((article) => (
                <Card 
                  key={article.id} 
                  className="bg-card border-border overflow-hidden hover:border-primary/50 transition-colors cursor-pointer"
                  onClick={() => navigate(`/blog/${article.id}`)}
                >
                  <div 
                    className="aspect-video bg-cover bg-center"
                    style={{ backgroundImage: `url(${article.image_url || "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=800"})` }}
                  />
                  <CardHeader className="pb-2">
                    <Badge variant="secondary" className="w-fit mb-2">
                      {article.category}
                    </Badge>
                    <CardTitle className="text-lg line-clamp-2">
                      {article.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                      {article.excerpt || article.content.substring(0, 100)}
                    </p>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3" />
                        {article.author_name}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {formatDate(article.created_at)}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}
      </main>

      <Footer />
    </div>
  );
};

export default Blog;