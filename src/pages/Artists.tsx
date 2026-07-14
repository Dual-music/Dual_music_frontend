import { useState, useEffect } from "react";
import SEO from "@/components/seo/SEO";
import { Link } from "react-router-dom";
import * as creators from "@/api/endpoints/creators";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Search, Users, Music, Mic } from "lucide-react";
import { motion } from "framer-motion";
import { useLanguage } from "@/contexts/LanguageContext";
import { SimplePagination } from "@/components/ui/simple-pagination";
import { usePagination } from "@/hooks/usePagination";
import { EmptyState } from "@/components/ui/empty-state";

interface Artist {
  id: string;
  user_id: string;
  stage_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  full_name: string | null;
  followers_count: number;
}

const Artists = () => {
  const { t } = useLanguage();
  const [artists, setArtists] = useState<Artist[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    loadArtists();
  }, []);

  const loadArtists = async () => {
    try {
      const rows = await creators.listArtists();
      const mapped: Artist[] = (rows || []).map((a: any) => ({
        id: a.id,
        user_id: a.user_id,
        stage_name: a.stage_name ?? null,
        avatar_url: a.avatar_url ?? null,
        bio: a.bio ?? null,
        full_name: a.full_name ?? null,
        followers_count: Number(a.followers_count) || 0,
      }));
      setArtists(mapped);
    } catch (error) {
      console.error("Error loading artists:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredArtists = artists.filter(artist => {
    const name = artist.stage_name || artist.full_name || "";
    return name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SEO title="Artistes — Dual Music" description="Explorez tous les artistes de Dual Music. Suivez vos préférés et soutenez leur carrière." path="/artists" />
      <Header />
      <main className="flex-1 pt-24 pb-12">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-12"
          >
            <Badge className="mb-4 bg-gradient-to-r from-purple-500 to-pink-500 text-white border-0">
              <Mic className="w-4 h-4 mr-1" />
              {t("artistsBadge")}
            </Badge>
            <h1 className="text-4xl md:text-5xl font-bold mb-4">
              {t("discoverArtists")}
            </h1>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              {t("discoverArtistsDesc")}
            </p>
          </motion.div>

          <div className="max-w-md mx-auto mb-8">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("searchArtist")}
                className="pl-10"
              />
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-20">
              <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filteredArtists.length === 0 ? (
            <EmptyState
              icon={<Mic />}
              title={searchQuery ? t("noArtistFound") : t("noArtistAvailable")}
              description={searchQuery ? t("artistsSearchEmptyDesc") : t("artistsEmptyDesc")}
            />
          ) : (
            <PaginatedArtists artists={filteredArtists} t={t} />
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
};

const PaginatedArtists = ({ artists, t }: { artists: Artist[]; t: any }) => {
  const { page, setPage, pageCount, paginated } = usePagination(artists, 12);
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {paginated.map((artist, index) => (
          <motion.div
            key={artist.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
          >
            <Link to={`/artist/${artist.user_id}`}>
              <Card className="overflow-hidden hover:border-primary transition-all hover:shadow-lg group cursor-pointer">
                <div className="aspect-square bg-gradient-to-br from-purple-500/20 to-pink-500/20 relative">
                  <Avatar className="w-full h-full rounded-none">
                    <AvatarImage src={artist.avatar_url || ""} className="object-cover" />
                    <AvatarFallback className="w-full h-full rounded-none text-6xl">
                      {(artist.stage_name || artist.full_name || "A")[0]}
                    </AvatarFallback>
                  </Avatar>
                  <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <CardContent className="p-4">
                  <h3 className="font-bold text-lg truncate">
                    {artist.stage_name || artist.full_name || t("artistDefault")}
                  </h3>
                  {artist.bio && (
                    <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{artist.bio}</p>
                  )}
                  <div className="flex items-center gap-2 mt-3">
                    <Badge variant="secondary" className="text-xs">
                      <Users className="w-3 h-3 mr-1" />
                      {artist.followers_count} {t("followers")}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </Link>
          </motion.div>
        ))}
      </div>
      <SimplePagination page={page} pageCount={pageCount} onPageChange={setPage} />
    </>
  );
};

export default Artists;
