import { describe, expect, it, vi } from "vitest";
import { SectorsRestClient } from "../packages/sectors-adapter/src/index.js";
import type { DomainError } from "../packages/domain/src/index.js";

type FetchImpl = (input: unknown, init?: { headers?: Record<string, string>; signal?: AbortSignal }) => Promise<Response>;

function restClientWith(fetchImpl: FetchImpl, apiKey?: string) {
  const fetcher = vi.fn(fetchImpl);
  const client = new SectorsRestClient({ baseUrl: "https://sectors.example.test", apiKey, fetcher: fetcher as unknown as typeof fetch });
  return { client, fetcher };
}

describe("SectorsRestClient", () => {
  it("requests the configured profile endpoint and parses the JSON response", async () => {
    const { client, fetcher } = restClientWith(async () => new Response(JSON.stringify({ data: { symbol: "AKRA" } }), { status: 200, headers: { "content-type": "application/json" } }));

    await expect(client.getCompanyProfile("akra")).resolves.toEqual({ data: { symbol: "AKRA" } });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe("https://sectors.example.test/company/report/AKRA/");
  });

  it("sends the API key as a bearer header without exposing it elsewhere", async () => {
    const { client, fetcher } = restClientWith(async () => new Response("{}", { status: 200 }), "test-key");

    await client.getCompanyProfile("AKRA");
    const init = fetcher.mock.calls[0][1] as { headers: Record<string, string> };
    expect(init.headers.Authorization).toBe("Bearer test-key");
  });

  it("maps non-2xx responses to PROVIDER_FAILURE with the HTTP status", async () => {
    const { client } = restClientWith(async () => new Response("{}", { status: 404 }));

    await expect(client.getFinancialStatements("AKRA")).rejects.toMatchObject({
      code: "PROVIDER_FAILURE",
      recovery: "Check the endpoint mapping and ticker against the official Sectors documentation.",
    } satisfies Partial<DomainError>);
    await expect(client.getFinancialStatements("AKRA")).rejects.toThrowError(expect.objectContaining({ message: expect.stringContaining("404") }));
  });

  it("maps 401 responses to credential recovery guidance", async () => {
    const { client } = restClientWith(async () => new Response("{}", { status: 401 }));

    await expect(client.getCompanyProfile("AKRA")).rejects.toMatchObject({
      code: "PROVIDER_FAILURE",
      recovery: expect.stringContaining("SECTORS_API_KEY"),
    } satisfies Partial<DomainError>);
  });

  it("maps network failures to PROVIDER_FAILURE", async () => {
    const { client } = restClientWith(async () => { throw new TypeError("fetch failed"); });

    await expect(client.getCompanyProfile("AKRA")).rejects.toMatchObject({
      code: "PROVIDER_FAILURE",
      recovery: "Check network connectivity and the Sectors base URL, then retry.",
    } satisfies Partial<DomainError>);
  });

  it("maps invalid JSON responses to INVALID_PROVIDER_PAYLOAD", async () => {
    const { client } = restClientWith(async () => new Response("{not-json", { status: 200 }));

    await expect(client.getCompanyProfile("AKRA")).rejects.toMatchObject({ code: "INVALID_PROVIDER_PAYLOAD" } satisfies Partial<DomainError>);
  });

  it("rejects malformed tickers before sending a request", async () => {
    const { client, fetcher } = restClientWith(async () => new Response("{}", { status: 200 }));

    await expect(client.getCompanyProfile("AK RA!")).rejects.toMatchObject({ code: "INVALID_PROVIDER_PAYLOAD" } satisfies Partial<DomainError>);
    expect(fetcher).not.toHaveBeenCalled();
  });
});