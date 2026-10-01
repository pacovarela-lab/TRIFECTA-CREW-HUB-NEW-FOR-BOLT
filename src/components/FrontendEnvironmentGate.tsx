import { lazy, Suspense } from "react";
import { CONFIGURATION_ERROR, readFrontendConfig } from "@/integrations/supabase/frontendConfig";

const App = lazy(() => import("../App"));

export function FrontendEnvironmentGate() {
  try {
    readFrontendConfig(import.meta.env);
  } catch {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div role="alert" className="max-w-md space-y-3 text-center">
          <h1 className="text-xl font-bold">Crew Hub no está configurado</h1>
          <p>{CONFIGURATION_ERROR}</p>
        </div>
      </main>
    );
  }
  return <Suspense fallback={<p role="status">Cargando Crew Hub…</p>}><App /></Suspense>;
}
