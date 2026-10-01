import { describe, expect, it } from "vitest";
import { summarizeGoogleTokenExchangeFailure } from "../../supabase/functions/_shared/google-oauth";

describe("summarizeGoogleTokenExchangeFailure", () => {
  it("reports invalid_client", () => {
    const line = summarizeGoogleTokenExchangeFailure(
      401,
      JSON.stringify({ error: "invalid_client", error_description: "Unauthorized" }),
    );
    expect(line).toBe("google_token_exchange_failed status=401 error=invalid_client description=Unauthorized");
  });

  it("reports redirect_uri_mismatch as invalid_request/invalid_grant style bodies", () => {
    const line = summarizeGoogleTokenExchangeFailure(
      400,
      JSON.stringify({ error: "invalid_request", error_description: "redirect_uri_mismatch" }),
    );
    expect(line).toContain("error=invalid_request");
    expect(line).toContain("description=redirect_uri_mismatch");
  });

  it("reports invalid_grant", () => {
    const line = summarizeGoogleTokenExchangeFailure(
      400,
      JSON.stringify({ error: "invalid_grant", error_description: "Bad Request" }),
    );
    expect(line).toContain("error=invalid_grant");
  });

  it("handles non JSON responses", () => {
    const line = summarizeGoogleTokenExchangeFailure(502, "<html>Bad Gateway</html>");
    expect(line).toBe("google_token_exchange_failed status=502 error=non_json_response description=unavailable");
  });

  it("handles 500 responses with empty error fields", () => {
    const line = summarizeGoogleTokenExchangeFailure(500, JSON.stringify({}));
    expect(line).toBe("google_token_exchange_failed status=500 error=unavailable description=unavailable");
  });

  it("never leaks tokens, secrets, verifiers, emails or uuids", () => {
    const line = summarizeGoogleTokenExchangeFailure(
      400,
      JSON.stringify({
        error: "invalid_grant",
        error_description:
          "code 4/0AY0e-g7ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ user user@example.com id 123e4567-e89b-12d3-a456-426614174000",
        access_token: "ya29.SECRETSECRETSECRETSECRETSECRETSECRETSECRET",
        refresh_token: "1//refreshrefreshrefreshrefreshrefreshrefresh",
        id_token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payloadpayloadpayload.signature",
      }),
    );
    expect(line).not.toContain("ya29.");
    expect(line).not.toContain("1//refresh");
    expect(line).not.toContain("eyJhbGciOi");
    expect(line).not.toContain("user@example.com");
    expect(line).not.toContain("123e4567-e89b-12d3-a456-426614174000");
    expect(line).toContain("error=invalid_grant");
  });

  it("truncates long descriptions to 300 characters", () => {
    const line = summarizeGoogleTokenExchangeFailure(
      400,
      JSON.stringify({ error: "invalid_request", error_description: "a ".repeat(400) }),
    );
    const description = line.split("description=")[1];
    expect(description.length).toBeLessThanOrEqual(300);
  });

  it("keeps the log on a single line", () => {
    const line = summarizeGoogleTokenExchangeFailure(
      400,
      JSON.stringify({ error: "invalid_client", error_description: "line1\nline2" }),
    );
    expect(line.includes("\n")).toBe(false);
  });
});
