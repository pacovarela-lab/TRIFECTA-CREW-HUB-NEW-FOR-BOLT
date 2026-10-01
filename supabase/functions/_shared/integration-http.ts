export const CORS_METHODS = {
  post: ["POST", "OPTIONS"],
  get: ["GET", "OPTIONS"],
} as const;

export function corsHeaders(methods: readonly string[]) {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization, x-client-info, apikey, content-type, x-company-id",
    "access-control-allow-methods": methods.join(", "),
    "vary": "Origin",
  };
}

export function corsPreflight(req: Request, methods: readonly string[]) {
  if (req.method !== "OPTIONS") return null;
  return new Response(null, { status: 204, headers: corsHeaders(methods) });
}

export const json = (body: unknown, status = 200, methods: readonly string[] = CORS_METHODS.post) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders(methods) },
  });

type MembershipRow = {
  company_id?: string | null;
  role?: string | null;
  active?: boolean | null;
};

export function resolveCompanyContext(memberships: MembershipRow[], requestedCompany?: string | null) {
  const validMemberships = memberships.filter((membership) =>
    membership.active !== false && Boolean(membership.company_id) && Boolean(membership.role)
  );
  const uniqueCompanyIds = [...new Set(validMemberships.map((membership) => membership.company_id as string))];

  if (requestedCompany) {
    if (!uniqueCompanyIds.includes(requestedCompany)) throw new Error("company_membership_required");
    return requestedCompany;
  }
  if (uniqueCompanyIds.length === 0) throw new Error("company_membership_required");
  if (uniqueCompanyIds.length > 1) throw new Error("company_context_required");
  return uniqueCompanyIds[0];
}
