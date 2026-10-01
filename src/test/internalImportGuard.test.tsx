import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InternalToolGuard } from "@/components/InternalToolGuard";
import { INTERNAL_TRIFECTA_COMPANY_ID } from "@/lib/tenant";

const roleState = vi.hoisted(() => ({ companyId: "external-company", loading: false }));

vi.mock("@/hooks/useUserRoles", () => ({ useUserRoles: () => roleState }));

describe("InternalToolGuard import boundary", () => {
  beforeEach(() => {
    roleState.companyId = "external-company";
    roleState.loading = false;
  });

  it("does not render or execute a protected screen before external authorization", () => {
    const sensitiveFetch = vi.fn();
    const ProtectedScreen = () => {
      sensitiveFetch();
      return <p>Import Estimate</p>;
    };

    render(<MemoryRouter><InternalToolGuard><ProtectedScreen /></InternalToolGuard></MemoryRouter>);
    expect(sensitiveFetch).not.toHaveBeenCalled();
    expect(screen.queryByText("Import Estimate")).not.toBeInTheDocument();
    expect(screen.getByText("This feature isn't available for your account.")).toBeInTheDocument();
  });

  it("renders the protected screen for the internal Trifecta tenant", () => {
    roleState.companyId = INTERNAL_TRIFECTA_COMPANY_ID;
    render(<MemoryRouter><InternalToolGuard><p>Import Estimate</p></InternalToolGuard></MemoryRouter>);
    expect(screen.getByText("Import Estimate")).toBeInTheDocument();
  });
});
