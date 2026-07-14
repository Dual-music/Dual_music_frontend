/**
 * Badge pays: drapeau (image SVG via flagcdn pour compat Windows) + nom localisé.
 */
import { Badge } from "@/components/ui/badge";
import { MapPin } from "lucide-react";
import { COUNTRIES } from "@/data/countries";

interface CountryBadgeProps {
  countryCode?: string | null;
  variant?: "default" | "secondary" | "outline";
  size?: "sm" | "md";
  className?: string;
}

export const CountryBadge = ({
  countryCode,
  variant = "secondary",
  size = "md",
  className = "",
}: CountryBadgeProps) => {
  if (!countryCode) return null;
  const code = countryCode.toUpperCase();
  const country = COUNTRIES.find((c) => c.code === code);
  if (!country) return null;
  const padding = size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm";
  const flagH = size === "sm" ? 10 : 14;
  return (
    <Badge
      variant={variant}
      className={`gap-1.5 ${padding} font-medium ${className}`}
      title={country.name}
    >
      <CountryFlag code={code} height={flagH} />
      <MapPin className="w-3 h-3 opacity-60" />
      <span>{country.name}</span>
    </Badge>
  );
};

export const CountryFlag = ({
  code,
  height = 14,
  className = "",
}: {
  code: string;
  height?: number;
  className?: string;
}) => {
  const lower = code.toLowerCase();
  return (
    <img
      src={`https://flagcdn.com/${lower}.svg`}
      alt=""
      aria-hidden
      style={{ height, width: "auto" }}
      className={`inline-block rounded-[2px] shadow-sm ${className}`}
      loading="lazy"
    />
  );
};
