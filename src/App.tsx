import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import Landing from "./pages/Landing";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Groups from "./pages/Groups";
import GroupDetail from "./pages/GroupDetail";
import MemberManagement from "./pages/MemberManagement";
import Feedback from "./pages/Feedback";
import NotFound from "./pages/NotFound";
import AdminActivity from "./pages/AdminActivity";
import AdminBackup from "./pages/AdminBackup";
import PublicProjectView from "./pages/PublicProjectView";
import FilePreview from "./pages/FilePreview";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <div className="min-h-screen flex items-center justify-center">Đang tải...</div>;
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/public/project/:shareToken" element={<PublicProjectView />} />
      <Route path="/file-preview" element={<FilePreview />} />
      <Route path="/auth" element={<Auth />} />
      <Route path="/auth/member" element={<Navigate to="/auth" replace />} />
      <Route path="/auth/admin" element={<Navigate to="/auth" replace />} />
      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/groups" element={<ProtectedRoute><Groups /></ProtectedRoute>} />
      <Route path="/groups/:groupId" element={<ProtectedRoute><GroupDetail /></ProtectedRoute>} />
      <Route path="/feedback" element={<ProtectedRoute><Feedback /></ProtectedRoute>} />
      <Route path="/members" element={<ProtectedRoute><MemberManagement /></ProtectedRoute>} />
      <Route path="/admin/activity" element={<ProtectedRoute><AdminActivity /></ProtectedRoute>} />
      <Route path="/admin/backup" element={<ProtectedRoute><AdminBackup /></ProtectedRoute>} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
