// Force git sync v2
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { lazy, Suspense, forwardRef } from "react";
import { SpeedInsights } from "@vercel/speed-insights/react";

import Index from "./pages/Index";
import MobileBottomNav from "./components/MobileBottomNav";

// Lazy load ALL non-index pages for faster initial load
const DetailsPage = lazy(() => import("./pages/DetailsPage"));
const MoviesPage = lazy(() => import("./pages/MoviesPage"));
const SeriesPage = lazy(() => import("./pages/SeriesPage"));
const DoramasPage = lazy(() => import("./pages/DoramasPage"));
const ReleasesPage = lazy(() => import("./pages/ReleasesPage"));
const AnimesPage = lazy(() => import("./pages/AnimesPage"));
const ComingSoonPage = lazy(() => import("./pages/ComingSoonPage"));
const PlayerPage = lazy(() => import("./pages/PlayerPage"));

const ApiRedirect = lazy(() => import("./pages/ApiRedirect"));
const NotFound = lazy(() => import("./pages/NotFound"));
const DmcaPage = lazy(() => import("./pages/DmcaPage"));
const TermsPage = lazy(() => import("./pages/TermsPage"));
const DadosPage = lazy(() => import("./pages/DadosPage"));
const MyListPage = lazy(() => import("./pages/MyListPage"));
const AuthPage = lazy(() => import("./pages/AuthPage"));
const ProfileSelector = lazy(() => import("./pages/ProfileSelector"));
const ImportListPage = lazy(() => import("./pages/ImportListPage"));
const TVPage = lazy(() => import("./pages/TVPage"));
const TVDownloadPage = lazy(() => import("./pages/TVDownloadPage"));

// Admin (lazy loaded)
const AdminLogin = lazy(() => import("./pages/AdminLogin"));
const AdminLayout = lazy(() => import("./components/admin/AdminLayout"));
const Dashboard = lazy(() => import("./pages/admin/Dashboard"));
const ContentManager = lazy(() => import("./pages/admin/ContentManager"));
const CategoriesManager = lazy(() => import("./pages/admin/CategoriesManager"));
const SettingsPage = lazy(() => import("./pages/admin/SettingsPage"));
const DiscordBotPage = lazy(() => import("./pages/admin/DiscordBotPage"));
const BancoPage = lazy(() => import("./pages/admin/BancoPage"));
const RequestsPage = lazy(() => import("./pages/admin/RequestsPage"));
const AlertsPage = lazy(() => import("./pages/admin/AlertsPage"));
const LogsPage = lazy(() => import("./pages/admin/LogsPage"));
const SecurityMonitor = lazy(() => import("./pages/admin/SecurityMonitor"));
const TelegramPage = lazy(() => import("./pages/admin/TelegramPage"));
const ReportsPage = lazy(() => import("./pages/admin/ReportsPage"));
const AdsManagerPage = lazy(() => import("./pages/admin/AdsManagerPage"));
const UsersPage = lazy(() => import("./pages/admin/UsersPage"));
const WatchRoomsPage = lazy(() => import("./pages/admin/WatchRoomsPage"));
const IntegrationsPage = lazy(() => import("./pages/admin/IntegrationsPage"));
const ContentSourcesPage = lazy(() => import("./pages/admin/ContentSourcesPage"));
const TVManager = lazy(() => import("./pages/admin/TVManager"));
const R2UploadPage = lazy(() => import("./pages/admin/R2UploadPage"));
const PublicLogsPage = lazy(() => import("./pages/PublicLogsPage"));
const QrxpPage = lazy(() => import("./pages/QrxpPage"));
const SupportPage = lazy(() => import("./pages/SupportPage"));
const TicketsPage = lazy(() => import("./pages/admin/TicketsPage"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 min — reduce refetches
      gcTime: 10 * 60 * 1000,   // 10 min cache
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});



const PageLoader = forwardRef<HTMLDivElement>((_, ref) => (
  <div ref={ref} className="fixed inset-0 z-[9999] bg-background flex items-center justify-center">
    <div className="w-10 h-10 rounded-full border-[3px] border-white/10 border-t-primary animate-spin" />
  </div>
));
PageLoader.displayName = "PageLoader";

const PlayerLoader = forwardRef<HTMLDivElement>((_, ref) => (
  <div ref={ref} className="fixed inset-0 z-[9999] bg-background flex items-center justify-center">
    <div className="w-12 h-12 rounded-full border-[3px] border-white/10 border-t-primary animate-spin" />
  </div>
));
PlayerLoader.displayName = "PlayerLoader";

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <SpeedInsights />
      <BrowserRouter>
        <MobileBottomNav />
        <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* Public */}
            <Route path="/" element={<Index />} />
            <Route path="/filmes" element={<MoviesPage />} />
            <Route path="/series" element={<SeriesPage />} />
            <Route path="/doramas" element={<DoramasPage />} />
            <Route path="/lancamentos" element={<ReleasesPage />} />
            <Route path="/animes" element={<AnimesPage />} />
            <Route path="/em-breve" element={<ComingSoonPage />} />
            <Route path="/minha-lista" element={<MyListPage />} />
            <Route path="/filme/:id" element={<DetailsPage type="movie" />} />
            <Route path="/serie/:id" element={<DetailsPage type="tv" />} />
            <Route path="/assistir/:type/:id" element={<ApiRedirect />} />
            <Route path="/player" element={<Suspense fallback={<PlayerLoader />}><PlayerPage /></Suspense>} />
            <Route path="/player/:type/:id" element={<Suspense fallback={<PlayerLoader />}><PlayerPage /></Suspense>} />
            <Route path="/lynetv" element={<TVPage />} />
            <Route path="/lynetv/:channelId" element={<TVPage />} />
            {/* <Route path="/download" element={<TVDownloadPage />} /> */}
            {/* <Route path="/download/:channelId" element={<TVDownloadPage />} /> */}
            <Route path="/dmca" element={<DmcaPage />} />
            <Route path="/termos" element={<TermsPage />} />
            <Route path="/dados" element={<DadosPage />} />
            <Route path="/conta" element={<AuthPage />} />
            <Route path="/perfis" element={<ProfileSelector />} />
            <Route path="/importar-lista" element={<ImportListPage />} />
            <Route path="/logs" element={<PublicLogsPage />} />
            <Route path="/qrxp" element={<QrxpPage />} />
            <Route path="/suporte" element={<SupportPage />} />

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
              <Route path="ads" element={<AdsManagerPage />} />
              <Route path="tv" element={<TVManager />} />
              <Route path="discord" element={<DiscordBotPage />} />
              <Route path="logs" element={<LogsPage />} />
              <Route path="seguranca" element={<SecurityMonitor />} />
              <Route path="avisos" element={<AlertsPage />} />
              <Route path="telegram" element={<TelegramPage />} />
              <Route path="integracoes" element={<IntegrationsPage />} />
              <Route path="fontes" element={<ContentSourcesPage />} />
              <Route path="usuarios" element={<UsersPage />} />
              <Route path="config" element={<SettingsPage />} />
              <Route path="watch-rooms" element={<WatchRoomsPage />} />
              <Route path="r2" element={<R2UploadPage />} />
              <Route path="tickets" element={<TicketsPage />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
