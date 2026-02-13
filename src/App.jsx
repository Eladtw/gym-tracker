// src/App.jsx
import { useEffect, useState } from "react";
import { Routes, Route, Link, useNavigate, useLocation } from "react-router-dom";
import { supabase } from "./lib/supabaseClient";

// מסכים
import Login from "./components/Login";
import Workouts from "./pages/Workouts";
import WorkoutDetail from "./pages/WorkoutDetail";
import SessionPage from "./pages/SessionPage";
import CalendarPage from "./pages/CalendarPage";
import ProgressPage from "./pages/ProgressPage";
import ExerciseLibrary from "./pages/ExerciseLibrary";
import "./css/App.css";

// טאב־בר תחתון – הגדרות של הראוטים
const TABS = [
  { to: "/calendar", label: "Calendar", icon: "📅" },
  { to: "/workouts", label: "Workouts", icon: "🏋️" },
  { to: "/progress", label: "Progress", icon: "📈" },
  { to: "/exercises", label: "Exercises", icon: "📚" },
];

export default function App() {
  const [session, setSession] = useState(null);
  const [init, setInit] = useState(true);
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

  async function logout() {
    await supabase.auth.signOut();
    navigate("/");
  }

  if (init) return null;

  if (!session) {
    return (
      <Login
        onSuccess={() => {
          navigate("/calendar");
        }}
      />
    );
  }

  const pathname = location.pathname;
  const isTabActive = (to) => {
    if (to === "/calendar") return pathname === "/" || pathname.startsWith("/calendar");
    return pathname.startsWith(to);
  };

  return (
    <div className="app-shell">
      <header className="app-topbar">
        <span className="app-topbar-email">{session.user.email}</span>
        <button className="app-logout-btn" onClick={logout}>
          Log out
        </button>
      </header>

      <main className="app-main">
        <Routes>
          <Route path="/" element={<CalendarPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/workouts" element={<Workouts />} />
          <Route path="/workouts/:id" element={<WorkoutDetail />} />
          <Route path="/session/:sessionId" element={<SessionPage />} />
          <Route path="/progress" element={<ProgressPage />} />
          <Route path="/progress/id/:exerciseId" element={<ProgressPage />} />
          <Route path="/exercises" element={<ExerciseLibrary />} />
        </Routes>
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
