import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { lazy, Suspense } from "react";
import Index from "./pages/Index";
import DetailsPage from "./pages/DetailsPage";
import MoviesPage from "./pages/MoviesPage";
import SeriesPage from "./pages/SeriesPage";
import NotFound from "./pages/NotFound";

// Admin (lazy loaded)
const AdminLogin = lazy(() => import("./pages/AdminLogin"));
const AdminLayout = lazy(() => import("./components/admin/AdminLayout"));
const Dashboard = lazy(() => import("./pages/admin/Dashboard"));
const ContentManager = lazy(() => import("./pages/admin/ContentManager"));
const CategoriesManager = lazy(() => import("./pages/admin/CategoriesManager"));
const SettingsPage = lazy(() => import("./pages/admin/SettingsPage"));

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
      <BrowserRouter>
        <Suspense fallback={<AdminLoader />}>
          <Routes>
            {/* Public */}
            <Route path="/" element={<Index />} />
            <Route path="/filmes" element={<MoviesPage />} />
            <Route path="/series" element={<SeriesPage />} />
            <Route path="/filme/:id" element={<DetailsPage type="movie" />} />
            <Route path="/serie/:id" element={<DetailsPage type="tv" />} />

            {/* Admin */}
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<Dashboard />} />
              <Route path="filmes" element={<ContentManager contentType="movie" title="Filmes" />} />
              <Route path="series" element={<ContentManager contentType="series" title="Séries" />} />
              <Route path="doramas" element={<ContentManager contentType="dorama" title="Doramas" />} />
              <Route path="animes" element={<ContentManager contentType="anime" title="Animes" />} />
              <Route path="categorias" element={<CategoriesManager />} />
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
