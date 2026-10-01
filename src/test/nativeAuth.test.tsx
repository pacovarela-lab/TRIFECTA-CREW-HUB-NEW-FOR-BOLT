import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { CompanyGate } from "@/components/CompanyGate";
import Login from "@/pages/Login";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(), onAuthStateChange: vi.fn(), signInWithOAuth: vi.fn(),
  signInWithPassword: vi.fn(), signOut: vi.fn(), unsubscribe: vi.fn(), toast: vi.fn(),
  roles: { loading: false, companyId: "company-1" as string | null },
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: mocks } }));
vi.mock("sonner", () => ({ toast: { error: mocks.toast } }));
vi.mock("@/hooks/useUserRoles", () => ({ useUserRoles: () => mocks.roles }));

const session = { user: { id: "user-1" }, access_token: "fixture" } as Session;
let authChanged: (event: string, session: Session | null) => void;
function PrivateScreen() {
  const { user, signOut } = useAuth();
  return <><p>Usuario {user?.id}</p><button onClick={signOut}>Salir</button></>;
}
const mount = (path = "/login") => render(
  <MemoryRouter initialEntries={[path]}><AuthProvider><Routes>
    <Route path="/login" element={<Login />} />
    <Route path="/onboarding" element={<p>Configurar compañía</p>} />
    <Route path="/" element={<ProtectedRoute><CompanyGate><PrivateScreen /></CompanyGate></ProtectedRoute>} />
  </Routes></AuthProvider></MemoryRouter>,
);

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState({}, "", "/login");
  mocks.roles.companyId = "company-1";
  mocks.getSession.mockResolvedValue({ data: { session: null } });
  mocks.onAuthStateChange.mockImplementation((callback) => { authChanged = callback; return { data: { subscription: { unsubscribe: mocks.unsubscribe } } }; });
  mocks.signInWithOAuth.mockResolvedValue({ data: { url: "https://accounts.google.com/fixture" }, error: null });
  mocks.signInWithPassword.mockResolvedValue({ error: null });
  mocks.signOut.mockImplementation(async () => { authChanged("SIGNED_OUT", null); });
});
afterEach(cleanup);

describe("native Auth preserves application behavior", () => {
  it("starts Google OAuth with the configured Supabase client and same-origin login callback", async () => {
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Continuar con Google" }));
    await waitFor(() => expect(mocks.signInWithOAuth).toHaveBeenCalledWith({ provider: "google", options: { redirectTo: `${window.location.origin}/login` } }));
    expect(screen.queryByText("Usuario user-1")).not.toBeInTheDocument();
  });

  it("keeps Google sign-in retryable and hides raw provider errors", async () => {
    mocks.signInWithOAuth.mockResolvedValue({ data: { url: null }, error: { message: "private-provider-detail" } });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Continuar con Google" }));
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith("No se pudo iniciar sesión con Google"));
    expect(screen.getByRole("button", { name: "Continuar con Google" })).toBeEnabled();
    expect(screen.queryByText("private-provider-detail")).not.toBeInTheDocument();
  });

  it("handles a cancelled OAuth callback without exposing its description", async () => {
    window.history.replaceState({}, "", "/login#error=access_denied&error_description=private-detail");
    mount();
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith("No se pudo iniciar sesión con Google"));
    expect(window.location.hash).toBe("");
  });

  it("restores the session, protects company routes, and signs out", async () => {
    mocks.getSession.mockResolvedValue({ data: { session } });
    const rendered = mount("/");
    expect(await screen.findByText("Usuario user-1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Salir" }));
    expect(await screen.findByRole("button", { name: "Continuar con Google" })).toBeInTheDocument();
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
    rendered.unmount();
    expect(mocks.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("does not render protected content without a session", async () => {
    mount("/");
    expect(await screen.findByRole("button", { name: "Continuar con Google" })).toBeInTheDocument();
    expect(screen.queryByText("Usuario user-1")).not.toBeInTheDocument();
  });

  it("keeps users without company membership on the existing onboarding path", async () => {
    mocks.getSession.mockResolvedValue({ data: { session } });
    mocks.roles.companyId = null;
    mount("/");
    expect(await screen.findByText("Configurar compañía")).toBeInTheDocument();
    expect(screen.queryByText("Usuario user-1")).not.toBeInTheDocument();
  });

  it("finishes a Google callback through the existing Auth state listener", async () => {
    mount();
    await screen.findByRole("button", { name: "Continuar con Google" });
    act(() => authChanged("SIGNED_IN", session));
    expect(await screen.findByText("Usuario user-1")).toBeInTheDocument();
  });

  it("keeps password sign-in on Supabase", async () => {
    mount();
    fireEvent.change(screen.getByLabelText("Correo"), { target: { value: "owner@example.test" } });
    fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: "fixture-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Iniciar sesión" }));
    await waitFor(() => expect(mocks.signInWithPassword).toHaveBeenCalledWith({ email: "owner@example.test", password: "fixture-password" }));
  });
});
