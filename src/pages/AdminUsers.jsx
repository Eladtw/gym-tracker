// src/pages/AdminUsers.jsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import "../css/AdminUsers.css";

function fmtDate(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
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

  // create modal
  const [open, setOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState("member");
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState("");

  // role edits
  const [pendingRole, setPendingRole] = useState({});
  const [savingIds, setSavingIds] = useState({});

  // active toggle
  const [togglingIds, setTogglingIds] = useState({});

  // delete confirm modal
  const [delOpen, setDelOpen] = useState(false);
  const [delTarget, setDelTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteErr, setDeleteErr] = useState("");

  const baseUrl = useMemo(() => import.meta.env.VITE_SUPABASE_URL, []);

  async function getToken() {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token || null;
  }

  async function loadUsers() {
    setErr("");
    setLoading(true);

    const { data, error } = await supabase
      .from("profiles")
      .select("id,email,display_name,role,is_active,created_at,last_login_at")
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

  async function toggleActive(userId, nextActive) {
    setTogglingIds((p) => ({ ...p, [userId]: true }));
    setErr("");

    try {
      const token = await getToken();
      if (!token) throw new Error("Missing session token. Please re-login.");

      const res = await fetch(`${baseUrl}/functions/v1/admin_set_user_active`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ user_id: userId, is_active: nextActive }),
      });

      const text = await res.text();
      if (!res.ok) throw new Error(`Failed: ${res.status} ${text}`);

      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, is_active: nextActive } : u)));
    } catch (e) {
      setErr(String(e));
    } finally {
      setTogglingIds((p) => ({ ...p, [userId]: false }));
    }
  }

  function openDelete(u) {
    setDeleteErr("");
    setDelTarget(u);
    setDelOpen(true);
  }

  async function confirmDelete() {
    if (!delTarget?.id) return;

    setDeleting(true);
    setDeleteErr("");

    try {
      const token = await getToken();
      if (!token) throw new Error("Missing session token. Please re-login.");

      const res = await fetch(`${baseUrl}/functions/v1/admin_delete_user`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ user_id: delTarget.id }),
      });

      const text = await res.text();
      if (!res.ok) throw new Error(`Failed: ${res.status} ${text}`);

      setDelOpen(false);
      setDelTarget(null);
      setDeleting(false);

      await loadUsers();
    } catch (e) {
      setDeleteErr(String(e));
      setDeleting(false);
    }
  }

  async function createUser() {
    setCreateErr("");

    const email = newEmail.trim().toLowerCase();
    const password = newPassword;
    const role = newRole;

    if (!email || !email.includes("@")) return setCreateErr("Please enter a valid email.");
    if (!password || password.length < 8) return setCreateErr("Password must be at least 8 characters.");
    if (role !== "admin" && role !== "member") return setCreateErr("Invalid role.");

    setCreating(true);

    try {
      const token = await getToken();
      if (!token) {
        setCreateErr("Missing session token. Please re-login.");
        setCreating(false);
        return;
      }

      const res = await fetch(`${baseUrl}/functions/v1/admin_create_user`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email, password, role }),
      });

      const text = await res.text();
      if (!res.ok) {
        setCreateErr(`Failed: ${res.status} ${text}`);
        setCreating(false);
        return;
      }

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
          <p>View users, last login, manage roles, and control access.</p>
        </div>

        <button className="um-createBtn um-hide-mobile" onClick={() => setOpen(true)}>
          <span className="um-plus" aria-hidden>+</span>
          Create User
        </button>
      </div>

      <button className="um-createBtn um-mobileBtn um-hide-desktop" onClick={() => setOpen(true)}>
        <span className="um-plus" aria-hidden>+</span>
        Create User
      </button>

      {err && <div className="um-error">{err}</div>}

      <section className="um-card">
        <div className="um-cardHead">
          <h3>Users</h3>
          <div className="um-search">
            <span className="um-searchIcon" aria-hidden>🔍</span>
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
            {/* Desktop / Tablet table */}
            <div className="um-tableWrap um-hide-mobile">
              <table className="um-table">
                <thead>
                  <tr>
                    <th>EMAIL</th>
                    <th>NAME</th>
                    <th>ROLE</th>
                    <th>STATUS</th>
                    <th>LAST LOGIN</th>
                    <th>CREATED</th>
                    <th className="um-thActions">ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="um-empty">No users found.</td>
                    </tr>
                  ) : (
                    filtered.map((u) => {
                      const selected = pendingRole[u.id] ?? u.role;
                      const dirty = pendingRole[u.id] && pendingRole[u.id] !== u.role;
                      const saving = !!savingIds[u.id];
                      const toggling = !!togglingIds[u.id];

                      return (
                        <tr key={u.id}>
                          <td className="um-mono">{u.email || "—"}</td>
                          <td>{u.display_name || "—"}</td>
                          <td>
                            <select
                              className="um-select"
                              value={selected}
                              onChange={(e) => setPendingRole((p) => ({ ...p, [u.id]: e.target.value }))}
                              disabled={saving}
                            >
                              <option value="member">member</option>
                              <option value="admin">admin</option>
                            </select>
                          </td>
                          <td>
                            <span className={"um-badge " + (u.is_active ? "um-badge--active" : "um-badge--inactive")}>
                              {u.is_active ? "Active" : "Inactive"}
                            </span>
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

                            <button
                              className="um-toggleBtn"
                              disabled={toggling}
                              onClick={() => toggleActive(u.id, !u.is_active)}
                              style={{ marginLeft: 10 }}
                            >
                              {toggling ? "Updating…" : (u.is_active ? "Deactivate" : "Activate")}
                            </button>

                            <button
                              className="um-dangerBtn"
                              disabled={u.is_active} /* safe: delete only if inactive */
                              onClick={() => openDelete(u)}
                              style={{ marginLeft: 10 }}
                              title={u.is_active ? "Deactivate user first" : "Delete user permanently"}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="um-mobileList um-hide-desktop">
              {filtered.length === 0 ? (
                <div className="um-emptyCard">No users found.</div>
              ) : (
                filtered.map((u) => {
                  const selected = pendingRole[u.id] ?? u.role;
                  const dirty = pendingRole[u.id] && pendingRole[u.id] !== u.role;
                  const saving = !!savingIds[u.id];
                  const toggling = !!togglingIds[u.id];

                  return (
                    <div className="um-userCard" key={u.id}>
                      <div className="um-cardRowTop">
                        <span className={"um-badge " + (u.is_active ? "um-badge--active" : "um-badge--inactive")}>
                          {u.is_active ? "Active" : "Inactive"}
                        </span>

                        <button
                          className="um-dangerBtn"
                          disabled={u.is_active}
                          onClick={() => openDelete(u)}
                          title={u.is_active ? "Deactivate user first" : "Delete user permanently"}
                        >
                          Delete
                        </button>
                      </div>

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
                          onChange={(e) => setPendingRole((p) => ({ ...p, [u.id]: e.target.value }))}
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

                      <div className="um-cardActions">
                        <button
                          className="um-saveBtn um-saveBtnFull"
                          disabled={!dirty || saving}
                          onClick={() => saveRole(u.id)}
                        >
                          {saving ? "Saving…" : "Save Role"}
                        </button>

                        <button
                          className="um-toggleBtn um-toggleBtnFull"
                          disabled={toggling}
                          onClick={() => toggleActive(u.id, !u.is_active)}
                        >
                          {toggling ? "Updating…" : (u.is_active ? "Deactivate" : "Activate")}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </section>

      {/* Create user modal */}
      {open && (
        <div className="um-modalBackdrop" role="dialog" aria-modal="true">
          <div className="um-modal">
            <div className="um-modalHead">
              <h3>Create User</h3>
              <button className="um-x" onClick={() => { setOpen(false); setCreateErr(""); }} aria-label="Close">
                ✕
              </button>
            </div>

            <div className="um-modalBody">
              <label className="um-inputLabel">Email</label>
              <input className="um-input" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="user@example.com" />

              <label className="um-inputLabel">Password</label>
              <input className="um-input" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="At least 8 characters" />

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

      {/* Delete confirm modal */}
      {delOpen && (
        <div className="um-modalBackdrop" role="dialog" aria-modal="true">
          <div className="um-modal">
            <div className="um-modalHead">
              <h3>Delete user</h3>
              <button className="um-x" onClick={() => { setDelOpen(false); setDelTarget(null); setDeleteErr(""); }} aria-label="Close">
                ✕
              </button>
            </div>

            <div className="um-modalBody">
              <p style={{ margin: 0 }}>
                This will permanently delete the user and all their data (workouts, sessions, sets, metrics, etc.).
              </p>
              <p style={{ margin: "10px 0 0", fontWeight: 800 }}>
                {delTarget?.email}
              </p>
              <p style={{ margin: "10px 0 0", opacity: 0.8 }}>
                Tip: Deactivate first, then Delete.
              </p>

              {deleteErr && <div className="um-error">{deleteErr}</div>}
            </div>

            <div className="um-modalActions">
              <button className="um-secondaryBtn" onClick={() => setDelOpen(false)} disabled={deleting}>
                Cancel
              </button>
              <button className="um-dangerBtn um-dangerBtn--solid" onClick={confirmDelete} disabled={deleting}>
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
