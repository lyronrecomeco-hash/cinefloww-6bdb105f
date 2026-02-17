import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { lazy, Suspense } from "react";
import SiteAlertModal from "./components/SiteAlertModal";
import Index from "./pages/Index";
import DetailsPage from "./pages/DetailsPage";
import MoviesPage from "./pages/MoviesPage";
import SeriesPage from "./pages/SeriesPage";
import PlayerPage from "./pages/PlayerPage";
import ApiRedirect from "./pages/ApiRedirect";
import NotFound from "./pages/NotFound";

// Admin (lazy loaded)
const AdminLogin = lazy(() => import("./pages/AdminLogin"));
const AdminLayout = lazy(() => import("./components/admin/AdminLayout"));
const Dashboard = lazy(() => import("./pages/admin/Dashboard"));
const ContentManager = lazy(() => import("./pages/admin/ContentManager"));
const CategoriesManager = lazy(() => import("./pages/admin/CategoriesManager"));
const SettingsPage = lazy(() => import("./pages/admin/SettingsPage"));
const CineveoTester = lazy(() => import("./pages/admin/CineveoTester"));
const BancoPage = lazy(() => import("./pages/admin/BancoPage"));
const RequestsPage = lazy(() => import("./pages/admin/RequestsPage"));
const AlertsPage = lazy(() => import("./pages/admin/AlertsPage"));

const queryClient = new QueryClient();

const AdminLoader = () => (
  <div className="min-h-screen bg-background flex items-center justify-center">
    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <SiteAlertModal />
      <BrowserRouter>
        <Suspense fallback={<AdminLoader />}>
          <Routes>
            {/* Public */}
            <Route path="/" element={<Index />} />
            <Route path="/filmes" element={<MoviesPage />} />
            <Route path="/series" element={<SeriesPage />} />
            <Route path="/filme/:id" element={<DetailsPage type="movie" />} />
            <Route path="/serie/:id" element={<DetailsPage type="tv" />} />
            <Route path="/assistir/:type/:id" element={<ApiRedirect />} />
            <Route path="/player" element={<PlayerPage />} />
            <Route path="/player/:type/:id" element={<PlayerPage />} />

            {/* API redirects */}
            <Route path="/api/:type/:id" element={<ApiRedirect />} />

            {/* Admin */}
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<Dashboard />} />
              <Route path="filmes" element={<ContentManager contentType="movie" title="Filmes" />} />
              <Route path="series" element={<ContentManager contentType="series" title="Séries" />} />
              <Route path="doramas" element={<ContentManager contentType="dorama" title="Doramas" />} />
              <Route path="animes" element={<ContentManager contentType="anime" title="Animes" />} />
              <Route path="categorias" element={<CategoriesManager />} />
              <Route path="pedidos" element={<RequestsPage />} />
              <Route path="banco" element={<BancoPage />} />
              <Route path="cineveo" element={<CineveoTester />} />
              <Route path="avisos" element={<AlertsPage />} />
              <Route path="config" element={<SettingsPage />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
