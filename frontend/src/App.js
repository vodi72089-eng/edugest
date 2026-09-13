import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import Landing from "@/pages/Landing";
import LoginPage from "@/pages/LoginPage";
import RegisterSchool from "@/pages/RegisterSchool";
import AdminDashboard from "@/pages/AdminDashboard";
import ParentLookup from "@/pages/ParentLookup";
import VerifyDoc from "@/pages/VerifyDoc";
import { Toaster } from "sonner";

function Protected({ children, roles }) {
  const { user, initialized } = useAuth();
  if (!initialized) return <div className="min-h-screen kente-pattern flex items-center justify-center text-amber-300 font-serif text-2xl">Chargement…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

function App() {
  return (
    <div className="App">
      <AuthProvider>
        <BrowserRouter>
          <Toaster position="top-right" theme="dark" richColors />
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register-school" element={<RegisterSchool />} />
            <Route path="/parent-lookup/:token" element={<ParentLookup />} />
            <Route path="/parent-lookup" element={<ParentLookup />} />
            <Route path="/verify/:docId" element={<VerifyDoc />} />
            <Route path="/admin/*" element={
              <Protected roles={["SCHOOL_ADMIN", "SUPER_ADMIN"]}>
                <AdminDashboard />
              </Protected>
            } />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </div>
  );
}

export default App;
