import { Button } from "@/components/ui/button";
import { Play, Mic, Trophy } from "lucide-react";
import { Link } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import heroBackground from "@/assets/hero-bg.jpg";
import duelIcon from "@/assets/duel-icon.png";

const Hero = () => {
  const { t } = useLanguage();

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      <div 
        className="absolute inset-0 bg-gradient-hero"
        style={{
          backgroundImage: `url(${heroBackground})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundBlendMode: 'overlay',
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-background/50 via-background/30 to-background" />
      
      <div className="container mx-auto px-4 relative z-10 py-20">
        <div className="max-w-4xl mx-auto text-center space-y-8 animate-fade-in">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-card/50 backdrop-blur-sm border border-primary/20 shadow-glow mb-6">
            <Mic className="w-4 h-4 text-accent" />
            <span className="text-sm text-foreground/80">{t("heroTitle")}</span>
          </div>

          <img 
            src={duelIcon} 
            alt="Dual Music" 
            className="w-24 h-24 mx-auto drop-shadow-glow-strong animate-scale-in"
          />

          <h1 className="text-5xl md:text-7xl font-bold leading-tight">
            <span 
              className="bg-gradient-primary bg-clip-text text-transparent"
              style={{
                WebkitTextStroke: '1px hsl(var(--foreground) / 0.3)',
                paintOrder: 'stroke fill',
                filter: 'drop-shadow(0 2px 8px hsl(var(--background) / 0.8))',
              }}
            >
              {t("heroSubtitle")}
            </span>
          </h1>

          <p 
            className="text-xl md:text-2xl max-w-2xl mx-auto font-semibold"
            style={{
              color: 'hsl(var(--foreground))',
              textShadow: '0 0 20px hsl(var(--background)), 0 0 40px hsl(var(--background)), 0 2px 4px hsl(var(--background) / 0.9)',
            }}
          >
            {t("heroDescription")}
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-6">
            <Link to="/auth">
              <Button 
                size="lg" 
                className="bg-gradient-primary hover:shadow-glow-strong transition-all text-lg px-8 group"
              >
                <Play className="w-5 h-5 mr-2 group-hover:scale-110 transition-transform" />
                {t("startNow")}
              </Button>
            </Link>
            <Link to="/duels">
              <Button 
                size="lg" 
                variant="outline" 
                className="border-primary/30 hover:border-primary hover:bg-primary/10 text-lg px-8 group"
              >
                <Trophy className="w-5 h-5 mr-2 group-hover:rotate-12 transition-transform" />
                {t("watchDuels")}
              </Button>
            </Link>
          </div>

        </div>
      </div>
    </section>
  );
};

export default Hero;
