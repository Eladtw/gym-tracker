import { useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function Login({ onSuccess }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setErr("");
    setLoading(true);

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (error) return setErr(error.message);

    // ✅ Update last_login_at via Edge Function (non-blocking)
    try {
      const token = data?.session?.access_token;

      // Vite env only
      const baseUrl = import.meta.env.VITE_SUPABASE_URL;

      console.log("[update-last-login] token exists?", !!token);
      console.log("[update-last-login] baseUrl:", baseUrl);

      if (!token) {
        console.warn("[update-last-login] Missing access_token");
      } else if (!baseUrl) {
        console.warn("[update-last-login] Missing VITE_SUPABASE_URL in .env");
      } else {
        const res = await fetch(`${baseUrl}/functions/v1/update-last-login`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        });

        const text = await res.text();
        console.log("[update-last-login] status:", res.status);
        console.log("[update-last-login] response:", text);

        if (!res.ok) {
          console.warn("[update-last-login] Failed:", res.status, text);
        }
      }
    } catch (e2) {
      console.warn("update-last-login exception:", e2);
    }

    onSuccess?.(data.user);
  }

  return (
    <div className="auth-wrap">
      <div className="brand">
        <div className="brand-icon" aria-hidden>
          {/* Dumbbell icon */}
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <path
              d="M3 9v6M7 8v8M17 8v8M21 9v6M9 12h6"
              stroke="#fff"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </div>
        <h1 className="brand-title">FitTracker</h1>
        <p className="brand-sub">Sign in to your account</p>
      </div>

      <div className="auth-card">
        <form onSubmit={handleSubmit} noValidate>
          <label className="field-label">Username</label>
          <div className="input-wrap">
            <span className="input-icon" aria-hidden>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5Zm0 2c-4 0-8 2-8 6v1h16v-1c0-4-4-6-8-6Z"
                  fill="currentColor"
                />
              </svg>
            </span>

            <input
              className="input"
              type="email"
              inputMode="email"
              autoComplete="username"
              placeholder="Enter your username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <label className="field-label">Password</label>
          <div className="input-wrap">
            <span className="input-icon" aria-hidden>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path
                  d="M17 11V8a5 5 0 0 0-10 0v3M6 11h12v9H6Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {err && <div className="error">{err}</div>}

          <button className="btn-primary" type="submit" disabled={loading}>
            {loading ? "Signing in…" : "Sign In"}
          </button>

          <p className="tagline">Track your fitness journey with precision</p>
        </form>
      </div>
    </div>
  );
}
