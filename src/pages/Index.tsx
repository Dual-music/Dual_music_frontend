import Header from "@/components/Header";
import SEO from "@/components/seo/SEO";
import Hero from "@/components/Hero";
import Features from "@/components/Features";
import Footer from "@/components/Footer";

const Index = () => {
  return (
    <div className="min-h-screen">
      <SEO title="Dual Music — Duels musicaux & concerts en direct" description="Plateforme N°1 de duels musicaux en direct. Votez pour vos artistes, regardez des concerts et soutenez la scène avec des cadeaux virtuels." path="/" />
      <Header />
      <main>
        <Hero />
        <Features />
      </main>
      <Footer />
    </div>
  );
};

export default Index;
