import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext.jsx";
import { ToastProvider } from "./components/Toast.jsx";
import Layout from "./components/Layout.jsx";
import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Classes from "./pages/Classes.jsx";
import Schedule from "./pages/Schedule.jsx";
import Topics from "./pages/Topics.jsx";
import Tests from "./pages/Tests.jsx";
import Results from "./pages/Results.jsx";
import Reports from "./pages/Reports.jsx";
import Materials from "./pages/Materials.jsx";
import Settings from "./pages/Settings.jsx";
import Admin from "./pages/Admin.jsx";
import Textbooks from "./pages/Textbooks.jsx";
import QualityControl from "./pages/QualityControl.jsx";
import Planner from "./pages/Planner.jsx";
import AuditLog from "./pages/AuditLog.jsx";

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex h-screen items-center justify-center text-sm text-slate-500" role="status">Yuklanmoqda...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <Protected>
              <Layout />
            </Protected>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="classes" element={<Classes />} />
          <Route path="schedule" element={<Schedule />} />
          <Route path="topics" element={<Topics />} />
          <Route path="tests" element={<Tests />} />
          <Route path="results" element={<Results />} />
          <Route path="reports" element={<Reports />} />
          <Route path="materials" element={<Materials />} />
          <Route path="settings" element={<Settings />} />
          <Route path="admin" element={<Admin />} />
          <Route path="textbooks" element={<Textbooks />} />
          <Route path="quality" element={<QualityControl />} />
          <Route path="planner" element={<Planner />} />
          <Route path="audit" element={<AuditLog />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </AuthProvider>
    </ToastProvider>
  );
}
