import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/layout/AppLayout";
import { CompanyGate } from "@/components/CompanyGate";
import { GlobalErrorBoundary } from "@/components/GlobalErrorBoundary";
import { InternalToolGuard } from "@/components/InternalToolGuard";

// Auth pages stay eager: they are the first thing an unauthenticated user needs.
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import ForgotPassword from "./pages/ForgotPassword";

// Everything behind the login is code-split so the initial bundle stays small
// (matters most for field crews on slow mobile connections).
const Dashboard = lazy(() => import("./pages/Dashboard"));
const DivisionDashboard = lazy(() => import("./pages/DivisionDashboard"));
const Projects = lazy(() => import("./pages/Projects"));
const ProjectDetail = lazy(() => import("./pages/ProjectDetail"));
const ImportEstimate = lazy(() => import("./pages/ImportEstimate"));
const Tasks = lazy(() => import("./pages/Tasks"));
const More = lazy(() => import("./pages/More"));
const ComingSoon = lazy(() => import("./pages/ComingSoon"));
const Workers = lazy(() => import("./pages/Workers"));
const Expenses = lazy(() => import("./pages/Expenses"));
const ExpenseDiscrepancies = lazy(() => import("./pages/ExpenseDiscrepancies"));
const Payments = lazy(() => import("./pages/Payments"));
const Alerts = lazy(() => import("./pages/Alerts"));
const Receipts = lazy(() => import("./pages/Receipts"));
const Reports = lazy(() => import("./pages/Reports"));
const ImportData = lazy(() => import("./pages/ImportData"));
const ImportTrifectaOS = lazy(() => import("./pages/ImportTrifectaOS"));
const Checkins = lazy(() => import("./pages/Checkins"));
const Users = lazy(() => import("./pages/Users"));
const Audit = lazy(() => import("./pages/Audit"));
const Assistant = lazy(() => import("./pages/Assistant"));
const Install = lazy(() => import("./pages/Install"));
const Ledger = lazy(() => import("./pages/Ledger"));
const BankReconciliation = lazy(() => import("./pages/BankReconciliation"));
const ImportReview = lazy(() => import("./pages/ImportReview"));
const ImportRules = lazy(() => import("./pages/ImportRules"));
const ImportV10 = lazy(() => import("./pages/ImportV10"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Settings = lazy(() => import("./pages/Settings"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const Feedback = lazy(() => import("./pages/Feedback"));
const EstimatePhotoScan = lazy(() => import("./pages/EstimatePhotoScan"));
const ProfitCalculator = lazy(() => import("./pages/ProfitCalculator"));


const queryClient = new QueryClient();

const PageLoader = () => (
  <div className="flex min-h-screen items-center justify-center bg-background">
    <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
  </div>
);

const App = () => (
  <GlobalErrorBoundary>
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
              <Route element={<ProtectedRoute><CompanyGate><AppLayout /></CompanyGate></ProtectedRoute>}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/divisions/:id" element={<DivisionDashboard />} />
                <Route path="/projects" element={<Projects />} />
                <Route path="/projects/:id" element={<ProjectDetail />} />
                <Route path="/import" element={<InternalToolGuard><ImportEstimate /></InternalToolGuard>} />
                <Route path="/tasks" element={<Tasks />} />
                <Route path="/more" element={<More />} />
                <Route path="/workers" element={<Workers />} />
                <Route path="/expenses" element={<Expenses />} />
                <Route path="/expenses/discrepancies" element={<ExpenseDiscrepancies />} />
                <Route path="/payments" element={<Payments />} />
                <Route path="/receipts" element={<Receipts />} />
                <Route path="/reports" element={<Reports />} />
                <Route path="/import-data" element={<InternalToolGuard><ImportData /></InternalToolGuard>} />
                <Route path="/import-trifecta-os" element={<InternalToolGuard><ImportTrifectaOS /></InternalToolGuard>} />
                <Route path="/import-review" element={<InternalToolGuard><ImportReview /></InternalToolGuard>} />
                <Route path="/import-review/:fileId" element={<InternalToolGuard><ImportReview /></InternalToolGuard>} />
                <Route path="/import-rules" element={<InternalToolGuard><ImportRules /></InternalToolGuard>} />
                <Route path="/import-v10" element={<InternalToolGuard><ImportV10 /></InternalToolGuard>} />
                <Route path="/checkins" element={<Checkins />} />
                <Route path="/alerts" element={<Alerts />} />
                <Route path="/users" element={<Users />} />
                <Route path="/audit" element={<InternalToolGuard><Audit /></InternalToolGuard>} />
                <Route path="/assistant" element={<Assistant />} />
                <Route path="/install" element={<Install />} />
                <Route path="/ledger" element={<InternalToolGuard><Ledger /></InternalToolGuard>} />
                <Route path="/bank" element={<InternalToolGuard><BankReconciliation /></InternalToolGuard>} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/feedback" element={<Feedback />} />
                <Route path="/estimate-photo" element={<EstimatePhotoScan />} />
                <Route path="/calculator" element={<ProfitCalculator />} />

              </Route>
              <Route path="/index" element={<Navigate to="/" replace />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  </GlobalErrorBoundary>
);

export default App;
