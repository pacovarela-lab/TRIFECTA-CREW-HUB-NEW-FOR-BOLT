import { Navigate } from "react-router-dom";
import { useUserRoles } from "@/hooks/useUserRoles";
import { resolveOnboardingRoute } from "@/lib/onboarding";

/**
 * Keeps authenticated users out of an empty app shell:
 * anyone without a company is sent to the self-service onboarding wizard.
 */
export const CompanyGate = ({ children }: { children: JSX.Element }) => {
  const { companyId, loading } = useUserRoles();
  const target = resolveOnboardingRoute({ loading, companyId });

  if (target === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }
  if (target === "onboarding") return <Navigate to="/onboarding" replace />;
  return children;
};
