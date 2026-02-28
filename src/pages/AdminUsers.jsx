// src/pages/AdminUsers.jsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import "../css/AdminUsers.css";

function fmtDate(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  // matching the screenshot style: short but readable
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminUsers({ isAdmin, roleInit }) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [users, setUsers] = useState([]);

  // search
  const [q, setQ] = useState("");

  // modal
  const [open, setOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState("member");
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState("");

  // inline role edits: { [id]: "admin"|"member" }
  const [pendingRole, setPendingRole] = useState({});
  const [savingIds, setSavingIds] = useState({}); // { [id]: true }

  const baseUrl = useMemo(() => import.meta.env.VITE_SUPABASE_URL, []);

  async function loadUsers() {
    setErr("");
    setLoading(true);

    const { data, error } = await supabase
      .from("profiles")
      .select("id,email,display_name,role,created_at,last_login_at")
      .order("created_at", { ascending: false });

    if (error) {
      setErr(error.message);
      setUsers([]);
      setLoading(false);
      return;
    }

    setUsers(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    if (roleInit) return;
    if (!isAdmin) {
      setLoading(false);
      setUsers([]);
      setErr("You are not authorized to view this page.");
      return;
    }
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleInit, isAdmin]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return users;
    return users.filter((u) => {
      const email = (u.email || "").toLowerCase();
      const name = (u.display_name || "").toLowerCase();
      return email.includes(term) || name.includes(term);
    });
  }, [users, q]);

  async function saveRole(userId) {
    const nextRole = pendingRole[userId];
    if (!nextRole) return;

    setSavingIds((p) => ({ ...p, [userId]: true }));
    setErr("");

    const { error } = await supabase.from("profiles").update({ role: nextRole }).eq("id", userId);

    if (error) {
      setErr(error.message);
      setSavingIds((p) => ({ ...p, [userId]: false }));
      return;
    }

    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: nextRole } : u)));

    setPendingRole((p) => {
      const cp = { ...p };
      delete cp[userId];
      return cp;
    });

    setSavingIds((p) => ({ ...p, [userId]: false }));
  }

  async function createUser() {
    setCreateErr("");

    const email = newEmail.trim().toLowerCase();
    const password = newPassword;
    const role = newRole;

    if (!email || !email.includes("@")) {
      setCreateErr("Please enter a valid email.");
      return;
    }
    if (!password || password.length < 8) {
      setCreateErr("Password must be at least 8 characters.");
      return;
    }
    if (role !== "admin" && role !== "member") {
      setCreateErr("Invalid role.");
      return;
    }

    setCreating(true);

    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess?.session?.access_token;

      if (!token) {
        setCreateErr("Missing session token. Please re-login.");
        setCreating(false);
        return;
      }

      const res = await fetch(`${baseUrl}/functions/v1/admin_create_user`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ email, password, role }),
      });

      const text = await res.text();
      if (!res.ok) {
        setCreateErr(`Failed: ${res.status} ${text}`);
        setCreating(false);
        return;
      }

      // Success -> close modal + reset + refresh list
      setOpen(false);
      setNewEmail("");
      setNewPassword("");
      setNewRole("member");
      setCreating(false);

      await loadUsers();
    } catch (e) {
      setCreateErr(String(e));
      setCreating(false);
    }
  }

  return (
    <div className="um-wrap">
      <div className="um-top">
        <div className="um-title">
          <h2>User Management</h2>
          <p>View users, last login, and manage roles.</p>
        </div>

        {/* desktop button */}
        <button className="um-createBtn um-hide-mobile" onClick={() => setOpen(true)}>
          <span className="um-plus" aria-hidden>
            +
          </span>
          Create User
        </button>
      </div>

      {/* mobile full-width button */}
      <button className="um-createBtn um-mobileBtn um-hide-desktop" onClick={() => setOpen(true)}>
        <span className="um-plus" aria-hidden>
          +
        </span>
        Create User
      </button>

      {err && <div className="um-error">{err}</div>}

      <section className="um-card">
        <div className="um-cardHead">
          <h3>Users</h3>

          <div className="um-search">
            <span className="um-searchIcon" aria-hidden>
              🔍
            </span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by email or name..."
              className="um-searchInput"
              type="search"
            />
          </div>
        </div>

        {loading ? (
          <div className="um-loading">Loading users…</div>
        ) : (
          <>
            {/* Desktop / Tablet: table */}
            <div className="um-tableWrap um-hide-mobile">
              <table className="um-table">
                <thead>
                  <tr>
                    <th>EMAIL</th>
                    <th>NAME</th>
                    <th>ROLE</th>
                    <th>LAST LOGIN</th>
                    <th>CREATED</th>
                    <th className="um-thActions">ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="um-empty">
                        No users found.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((u) => {
                      const selected = pendingRole[u.id] ?? u.role;
                      const dirty = pendingRole[u.id] && pendingRole[u.id] !== u.role;
                      const saving = !!savingIds[u.id];

                      return (
                        <tr key={u.id}>
                          <td className="um-mono">{u.email || "—"}</td>
                          <td>{u.display_name || "—"}</td>
                          <td>
                            <select
                              className="um-select"
                              value={selected}
                              onChange={(e) =>
                                setPendingRole((p) => ({
                                  ...p,
                                  [u.id]: e.target.value,
                                }))
                              }
                              disabled={saving}
                            >
                              <option value="member">member</option>
                              <option value="admin">admin</option>
                            </select>
                          </td>
                          <td>{fmtDate(u.last_login_at)}</td>
                          <td>{fmtDate(u.created_at)}</td>
                          <td className="um-actions">
                            <button
                              className="um-saveBtn"
                              disabled={!dirty || saving}
                              onClick={() => saveRole(u.id)}
                            >
                              {saving ? "Saving…" : "Save"}
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile: card list like the screenshot */}
            <div className="um-mobileList um-hide-desktop">
              {filtered.length === 0 ? (
                <div className="um-emptyCard">No users found.</div>
              ) : (
                filtered.map((u) => {
                  const selected = pendingRole[u.id] ?? u.role;
                  const dirty = pendingRole[u.id] && pendingRole[u.id] !== u.role;
                  const saving = !!savingIds[u.id];

                  return (
                    <div className="um-userCard" key={u.id}>
                      <div className="um-field">
                        <div className="um-label">EMAIL</div>
                        <div className="um-value um-mono">{u.email || "—"}</div>
                      </div>

                      <div className="um-field">
                        <div className="um-label">NAME</div>
                        <div className="um-value">{u.display_name || "—"}</div>
                      </div>

                      <div className="um-field">
                        <div className="um-label">ROLE</div>
                        <select
                          className="um-select"
                          value={selected}
                          onChange={(e) =>
                            setPendingRole((p) => ({
                              ...p,
                              [u.id]: e.target.value,
                            }))
                          }
                          disabled={saving}
                        >
                          <option value="member">member</option>
                          <option value="admin">admin</option>
                        </select>
                      </div>

                      <div className="um-twoCols">
                        <div className="um-field">
                          <div className="um-label">LAST LOGIN</div>
                          <div className="um-value">{fmtDate(u.last_login_at)}</div>
                        </div>
                        <div className="um-field">
                          <div className="um-label">CREATED</div>
                          <div className="um-value">{fmtDate(u.created_at)}</div>
                        </div>
                      </div>

                      <button
                        className="um-saveBtn um-saveBtnFull"
                        disabled={!dirty || saving}
                        onClick={() => saveRole(u.id)}
                      >
                        {saving ? "Saving…" : "Save"}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </section>

      {/* Modal */}
      {open && (
        <div className="um-modalBackdrop" role="dialog" aria-modal="true">
          <div className="um-modal">
            <div className="um-modalHead">
              <h3>Create User</h3>
              <button
                className="um-x"
                onClick={() => {
                  setOpen(false);
                  setCreateErr("");
                }}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="um-modalBody">
              <label className="um-inputLabel">Email</label>
              <input
                className="um-input"
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="user@example.com"
                autoComplete="off"
              />

              <label className="um-inputLabel">Password</label>
              <input
                className="um-input"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 8 characters"
                autoComplete="new-password"
              />

              <label className="um-inputLabel">Role</label>
              <select className="um-select" value={newRole} onChange={(e) => setNewRole(e.target.value)}>
                <option value="member">member</option>
                <option value="admin">admin</option>
              </select>

              {createErr && <div className="um-error">{createErr}</div>}
            </div>

            <div className="um-modalActions">
              <button className="um-secondaryBtn" onClick={() => setOpen(false)} disabled={creating}>
                Cancel
              </button>
              <button className="um-createBtn" onClick={createUser} disabled={creating}>
                {creating ? "Creating…" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
