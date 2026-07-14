/**
 * utils
 * -----
 * Helpers UI partagés. `cn(...classes)` fusionne classes Tailwind en gérant
 * les conflits (twMerge) tout en supportant clsx (conditions, arrays).
 *
 * @example cn("p-2", isActive && "bg-primary", "p-4") // → "bg-primary p-4"
 */
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
