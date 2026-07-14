/**
 * Global test setup — registers jest-dom matchers and unmounts React trees
 * between tests so component state never leaks across cases.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});
