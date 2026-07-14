import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Badge } from "./badge";

/**
 * Smoke test proving the component-testing pipeline (jsdom + Testing Library +
 * the `@/` alias + JSX transform) renders a real component and its variants.
 */
describe("<Badge>", () => {
  it("renders its children", () => {
    render(<Badge>En direct</Badge>);
    expect(screen.getByText("En direct")).toBeInTheDocument();
  });

  it("applies the destructive variant class", () => {
    render(<Badge variant="destructive">Banni</Badge>);
    expect(screen.getByText("Banni").className).toContain("destructive");
  });
});
