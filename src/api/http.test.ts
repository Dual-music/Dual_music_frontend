import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Anonymous transport: no tokens, so no auth header and no refresh-on-401 path.
vi.mock("./tokens", () => ({
  getAccessToken: () => null,
  getRefreshToken: () => null,
  setTokens: vi.fn(),
  clearTokens: vi.fn(),
}));

import { ApiError, http } from "./http";

/** Builds a minimal `Response`-like object for the mocked fetch. */
function jsonResponse(status: number, body: unknown): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    statusText: "",
    json: async () => body,
  } as unknown as Response;
}

describe("http client", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("unwraps the success envelope and returns just `data`", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      jsonResponse(200, { data: { id: "7", name: "duel" }, meta: { requestId: "r1" } }),
    );
    const result = await http.get<{ id: string; name: string }>("/duels/7");
    expect(result).toEqual({ id: "7", name: "duel" });
  });

  it("throws a typed ApiError carrying the envelope code on failure", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      jsonResponse(400, { error: { code: "WALLET_INSUFFICIENT", message: "Solde insuffisant" } }),
    );
    await expect(http.get("/wallet/withdraw")).rejects.toMatchObject({
      code: "WALLET_INSUFFICIENT",
      status: 400,
    });
    await expect(http.get("/wallet/withdraw")).rejects.toBeInstanceOf(ApiError);
  });

  it("returns undefined for a 204 No Content", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse(204, null));
    await expect(http.delete("/notifications/1")).resolves.toBeUndefined();
  });
});
