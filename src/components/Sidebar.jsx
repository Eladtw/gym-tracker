// src/components/Sidebar.jsx
import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Home, CalendarDays, Dumbbell, TrendingUp, BookOpen, Users, LogOut, X } from "lucide-react";

const NAV_ITEMS = [
  { to: "/home", label: "Home", icon: Home },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/workouts", label: "Workouts", icon: Dumbbell },
  { to: "/workout", label: "Workout", icon: Dumbbell },
  { to: "/progress", label: "Progress", icon: TrendingUp },
  { to: "/exercises", label: "Exercises", icon: BookOpen },
];

export default function Sidebar({ open, onClose, isAdmin, onLogout }) {
  const location = useLocation();

  // Lock body scroll when sidebar is open
  useEffect(() => {
    if (open) {
      document.body.classList.add("sidebar-open");
    } else {
      document.body.classList.remove("sidebar-open");
    }
    return () => document.body.classList.remove("sidebar-open");
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const isActive = (to) => {
    if (to === "/home") return location.pathname === "/" || location.pathname === "/home";
    return location.pathname.startsWith(to);
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={"sidebar-backdrop" + (open ? " is-visible" : "")}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sidebar panel */}
      <nav
        className={"sidebar-panel" + (open ? " is-open" : "")}
        aria-label="Main navigation"
      >
        {/* Header */}
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <div className="sidebar-brand-icon">
              <Dumbbell size={20} strokeWidth={2.5} />
            </div>
            <span className="sidebar-brand-name">FitTracker</span>
          </div>
          <button
            className="sidebar-close-btn"
            onClick={onClose}
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        </div>

        {/* Nav links */}
        <div className="sidebar-nav">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={"sidebar-nav-item" + (active ? " is-active" : "")}
                onClick={onClose}
              >
                <Icon size={20} strokeWidth={active ? 2.5 : 2} />
                <span>{item.label}</span>
              </Link>
            );
          })}

          {isAdmin && (
            <Link
              to="/admin/users"
              className={"sidebar-nav-item" + (location.pathname === "/admin/users" ? " is-active" : "")}
              onClick={onClose}
            >
              <Users size={20} strokeWidth={location.pathname === "/admin/users" ? 2.5 : 2} />
              <span>User Management</span>
            </Link>
          )}
        </div>

        {/* Footer */}
        <div className="sidebar-footer">
          <button className="sidebar-logout-btn" onClick={() => { onLogout(); onClose(); }}>
            <LogOut size={18} />
            <span>Log out</span>
          </button>
        </div>
      </nav>
    </>
  );
}
