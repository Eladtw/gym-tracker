// src/App.jsx
import { useEffect, useState } from "react";
import { Routes, Route, Link, useNavigate, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { supabase } from "./lib/supabaseClient";
import { Menu, Dumbbell } from "lucide-react";
import { useAppDataCache } from "./context/AppDataCacheContext";

// Pages
import Login from "./components/Login";
import Sidebar from "./components/Sidebar";
import HomePage from "./pages/HomePage";
import Workouts from "./pages/Workouts";
import WorkoutDetail from "./pages/WorkoutDetail";
import SessionPage from "./pages/SessionPage";
import CalendarPage from "./pages/CalendarPage";
import ProgressPage from "./pages/ProgressPage";
import ExerciseLibrary from "./pages/ExerciseLibrary";
import AdminUsers from "./pages/AdminUsers";
import SessionSummaryPage from "./pages/SessionSummaryPage";

import "./css/App.css";
import "./css/sidebar.css";

// Bottom tab bar items
const TABS = [
  { to: "/home", label: "Home", icon: "🏠" },
  { to: "/calendar", label: "Calendar", icon: "📅" },
  { to: "/workouts", label: "Workouts", icon: "🏋️" },
  { to: "/progress", label: "Progress", icon: "📈" },
  { to: "/exercises", label: "Exercises", icon: "📚" },
];

function PageTransition({ children, pathname }) {
  return (
    <AnimatePresence mode="wait" initial={true}>
      <motion.div
        key={pathname}
        className="page-transition-shell"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [init, setInit] = useState(true);
  const { clearCache } = useAppDataCache();

  // Role gating
  const [roleInit, setRoleInit] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  // Sidebar
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session ?? null);
      setInit(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => {
      if (!mounted) return;
      setSession(s ?? null);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    async function loadRole() {
      if (!session?.user?.id) {
        if (!mounted) return;
        setIsAdmin(false);
        setRoleInit(false);
        return;
      }

      setRoleInit(true);

      const { data, error } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", session.user.id)
        .single();

      if (!mounted) return;

      if (error) {
        console.warn("[role] failed to load profile role:", error.message);
        setIsAdmin(false);
        setRoleInit(false);
        return;
      }

      setIsAdmin(data?.role === "admin");
      setRoleInit(false);
    }

    loadRole();

    return () => {
      mounted = false;
    };
  }, [session?.user?.id]);

  async function logout() {
  clearCache();
  await supabase.auth.signOut();
  navigate("/");
  }

  if (init) return null;

  if (!session) {
    return (
      <Login
        onSuccess={() => {
          navigate("/home");
        }}
      />
    );
  }

  const pathname = location.pathname;

  const isTabActive = (to) => {
    if (to === "/home") return pathname === "/home" || pathname === "/";
    if (to === "/calendar") return pathname.startsWith("/calendar");
    return pathname.startsWith(to);
  };

  return (
    <div className="app-shell">
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        isAdmin={!roleInit && isAdmin}
        onLogout={logout}
      />

      <header className="app-topbar-new">
        <button
          className="app-menu-btn"
          onClick={() => setSidebarOpen(true)}
          aria-label="Open menu"
        >
          <Menu size={20} />
        </button>

        <div className="app-topbar-brand">
          <div className="app-topbar-brand-icon">
            <Dumbbell size={16} strokeWidth={2.5} />
          </div>
          <span className="app-topbar-brand-name">FitTracker</span>
        </div>
      </header>

      <main className="app-main">
        <PageTransition pathname={pathname}>
          <Routes location={location}>
            <Route path="/" element={<HomePage />} />
            <Route path="/home" element={<HomePage />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/workouts" element={<Workouts />} />
            <Route path="/workouts/:id" element={<WorkoutDetail />} />
            <Route path="/session/:sessionId" element={<SessionPage />} />
            <Route path="/session/:sessionId/summary" element={<SessionSummaryPage />} />
            <Route path="/progress" element={<ProgressPage />} />
            <Route path="/progress/id/:exerciseId" element={<ProgressPage />} />
            <Route path="/exercises" element={<ExerciseLibrary />} />
            <Route
              path="/admin/users"
              element={<AdminUsers isAdmin={isAdmin} roleInit={roleInit} />}
            />
          </Routes>
        </PageTransition>
      </main>

      <nav className="app-bottom-nav" aria-label="Bottom navigation">
        {TABS.map((tab) => {
          const active = isTabActive(tab.to);
          return (
            <Link
              key={tab.to}
              to={tab.to}
              className={"app-nav-item" + (active ? " app-nav-item--active" : "")}
            >
              <span className="app-nav-icon">{tab.icon}</span>
              <span className="app-nav-label">{tab.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}