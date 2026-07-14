/**
 * Tutoriel visuel 5 étapes animé post-signup : présentation features (concerts, duels, gifts,
 * wallet, referral). Stockage progression localStorage.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronRight, Check } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";

import imgWelcome from "@/assets/onboarding/step-welcome.png";
import imgDuels from "@/assets/onboarding/step-duels.png";
import imgFollow from "@/assets/onboarding/step-follow.png";
import imgGifts from "@/assets/onboarding/step-gifts.png";
import imgReady from "@/assets/onboarding/step-ready.png";

interface WelcomeOnboardingProps {
  userName?: string;
}

const steps = [
  {
    image: imgWelcome,
    title: "Bienvenue sur Dual Music !",
    subtitle: "La plateforme qui met les artistes en compétition.",
    description:
      "Découvrez, soutenez et votez pour vos artistes préférés lors de duels musicaux en direct.",
    cta: "Commencer la visite",
  },
  {
    image: imgDuels,
    title: "Assistez aux Duels",
    subtitle: "Des affrontements musicaux en temps réel.",
    description:
      "Regardez deux artistes s'affronter en live. Votez avec vos crédits pour soutenir votre favori et influencer le résultat.",
    cta: "Suivant",
  },
  {
    image: imgFollow,
    title: "Suivez vos Artistes",
    subtitle: "Restez connecté à votre scène musicale.",
    description:
      "Abonnez-vous à vos artistes préférés, regardez leurs lives exclusifs et leurs vidéos lifestyle.",
    cta: "Suivant",
  },
  {
    image: imgGifts,
    title: "Envoyez des Cadeaux",
    subtitle: "Montrez votre soutien avec des cadeaux virtuels.",
    description:
      "Rechargez votre portefeuille et offrez des cadeaux virtuels à vos artistes pendant les streams pour les encourager.",
    cta: "Suivant",
  },
  {
    image: imgReady,
    title: "Tout est prêt !",
    subtitle: "Votre compte est configuré.",
    description:
      "Explorez les duels en cours, complétez votre profil et commencez à vivre l'expérience Dual Music.",
    cta: "Accéder à mon profil",
  },
];

const WelcomeOnboarding = ({ userName }: WelcomeOnboardingProps) => {
  const [currentStep, setCurrentStep] = useState(0);
  const navigate = useNavigate();

  const step = steps[currentStep];
  const isLast = currentStep === steps.length - 1;

  const handleNext = () => {
    if (isLast) {
      navigate("/profile");
    } else {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handleSkip = () => {
    navigate("/profile");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-hero p-4">
      <div className="w-full max-w-md">
        {/* Progress dots */}
        <div className="flex justify-center gap-2 mb-6">
          {steps.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentStep(i)}
              className={`h-2 rounded-full transition-all duration-300 ${
                i === currentStep
                  ? "w-8 bg-primary"
                  : i < currentStep
                  ? "w-2 bg-primary/50"
                  : "w-2 bg-muted"
              }`}
              aria-label={`Étape ${i + 1}`}
            />
          ))}
        </div>

        {/* Card */}
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="bg-card/60 backdrop-blur-lg border border-border/50 rounded-2xl overflow-hidden shadow-elegant"
          >
            {/* Illustration */}
            <div className="relative h-52 overflow-hidden bg-black/40">
              <motion.img
                key={step.image}
                src={step.image}
                alt=""
                initial={{ scale: 1.08, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                className="w-full h-full object-cover"
                aria-hidden="true"
              />
              {/* Gradient overlay to blend into card */}
              <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-card/80 to-transparent" />
            </div>

            {/* Content */}
            <div className="px-8 pb-8 pt-4 text-center">
              {/* Step label */}
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                Étape {currentStep + 1} / {steps.length}
              </p>

              {/* Title */}
              <h1 className="text-2xl font-bold text-foreground mb-1">
                {currentStep === 0 && userName
                  ? `Bonjour, ${userName} !`
                  : step.title}
              </h1>

              {/* Subtitle */}
              <p className="text-primary font-medium text-sm mb-3">
                {step.subtitle}
              </p>

              {/* Description */}
              <p className="text-muted-foreground text-sm leading-relaxed mb-6">
                {step.description}
              </p>

              {/* Feature bullets on last step */}
              {isLast && (
                <ul className="text-left space-y-2 mb-6">
                  {[
                    "Profil personnalisable",
                    "Portefeuille de crédits",
                    "Notifications en temps réel",
                  ].map((item) => (
                    <li
                      key={item}
                      className="flex items-center gap-3 text-sm text-muted-foreground"
                    >
                      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/15 flex items-center justify-center">
                        <Check className="w-3 h-3 text-primary" />
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              )}

              {/* CTA */}
              <Button
                onClick={handleNext}
                className="w-full bg-gradient-primary hover:shadow-glow transition-all text-base py-5"
              >
                {step.cta}
                {!isLast && <ChevronRight className="w-4 h-4 ml-1" />}
              </Button>

              {/* Skip */}
              {!isLast && (
                <button
                  onClick={handleSkip}
                  className="mt-4 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Passer la visite
                </button>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};

export default WelcomeOnboarding;
