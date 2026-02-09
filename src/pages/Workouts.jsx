// src/pages/Workouts.jsx
import "../css/workouts-page.css";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

// עוזר: נרמול set_targets
function normalizeTargets(t) {
  if (!Array.isArray(t)) return [];
  return [...t]
    .map((s) => ({
      set_index: Number(s?.set_index) || 0,
      reps: s?.reps ?? null,
      weight: s?.weight ?? null,
    }))
    .sort((a, b) => a.set_index - b.set_index);
}

// עוזר: טקסט סיכום לסטים של תרגיל (בשורת תרגילים המורחבת)
function summarizeExerciseTargets(setTargets) {
  const arr = normalizeTargets(setTargets);
  if (arr.length === 0) return "";

  const repsArr = arr.map((s) => Number(s.reps) || 0);
  const wgtArr = arr.map((s) => Number(s.weight) || 0);

  const allRepsSame = repsArr.every((v) => v === repsArr[0]);
  const allWgtSame = wgtArr.every((v) => v === wgtArr[0]);

  if (allRepsSame && allWgtSame) {
    // 3 × 10
    return `${arr.length} × ${repsArr[0]}`;
  }
  if (allRepsSame && !allWgtSame) {
    // 3 sets · 10 reps (varying weight)
    return `${arr.length} sets · ${repsArr[0]} reps (varying weight)`;
  }
  if (!allRepsSame && allWgtSame) {
    // 3 sets · 80 kg (varying reps)
    return `${arr.length} sets · ${wgtArr[0]} kg (varying reps)`;
  }
  // 3 sets (varying reps & weight)
  return `${arr.length} sets (varying reps & weight)`;
}

// עוזר: חישוב סטטיסטיקות לאימון שלם
function getWorkoutStats(workout) {
  const exercises = workout.exercises || [];
  const exercisesCount = exercises.length;

  let totalSets = 0;
  const muscleGroupsSet = new Set();

  exercises.forEach((ex) => {
    // סופרים סטים לפי set_targets
    const normalized = normalizeTargets(ex.set_targets);
    totalSets += normalized.length;

    // הוצאת קבוצת השריר ברמת group (Chest / Back / Legs וכו')
    const groupLabel =
      ex.exercises_catalog?.primary_subgroup?.group?.label ||
      ex.exercises_catalog?.primary_subgroup?.label ||
      null;

    if (groupLabel) {
      muscleGroupsSet.add(groupLabel);
    }
  });

  return {
    exercisesCount,
    totalSets,
    muscleGroups: Array.from(muscleGroupsSet),
  };
}

export default function Workouts() {
  const [workouts, setWorkouts] = useState([]);
  const [name, setName] = useState("");
  const [msg, setMsg] = useState("");

  const [showCreateModal, setShowCreateModal] = useState(false);

  // למחיקה
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null); // { id, name }
  const [deleting, setDeleting] = useState(false);

  // dropdown פתוח
  const [expandedId, setExpandedId] = useState(null);

  const navigate = useNavigate();

  async function load() {
    setMsg("");

    // מוצא את המשתמש המחובר
    const { data: s } = await supabase.auth.getSession();
    const uid = s?.session?.user?.id;
    if (!uid) {
      setMsg("❌ Not logged in");
      setWorkouts([]);
      return;
    }

    // טוען אימונים של המשתמש + התרגילים והקבוצות שריר לכל אימון
    const [
      { data: workoutsData, error: wError },
      { data: exData, error: exError },
    ] = await Promise.all([
      supabase
        .from("workouts")
        .select("id, name, created_at")
        .eq("user_id", uid)
        .order("created_at", { ascending: false }),
      supabase
        .from("workout_exercises")
        .select(
          `
          id,
          workout_id,
          exercise_name,
          exercise_id,
          set_targets,
          exercises_catalog (
            id,
            name,
            primary_subgroup_id,
            primary_subgroup:muscle_subgroups!exercises_catalog_primary_subgroup_id_fkey (
              id,
              label,
              group:muscle_groups!muscle_subgroups_group_id_fkey (
                id,
                label
              )
            )
          )
        `,
        ),
    ]);

    if (wError || exError) {
      setMsg(
        "❌ " +
          (wError?.message || exError?.message || "Failed to load workouts"),
      );
      setWorkouts([]);
      return;
    }

    // קיבוץ תרגילים לפי workout_id
    const byWorkout = new Map();
    (exData || []).forEach((ex) => {
      if (!byWorkout.has(ex.workout_id)) byWorkout.set(ex.workout_id, []);
      byWorkout.get(ex.workout_id).push(ex);
    });

    // חיבור התרגילים לכל אימון
    const merged = (workoutsData || []).map((w) => ({
      ...w,
      exercises: byWorkout.get(w.id) || [],
    }));

    setWorkouts(merged);
  }

  useEffect(() => {
    load();
  }, []);

  async function createWorkout() {
    const { data: s } = await supabase.auth.getSession();
    const uid = s?.session?.user?.id;
    if (!uid) {
      setMsg("❌ Not logged in");
      return false;
    }
    if (!name.trim()) {
      setMsg("❌ Enter workout name");
      return false;
    }

    const { error } = await supabase
      .from("workouts")
      .insert({ user_id: uid, name: name.trim(), notes: null });

    if (error) {
      setMsg("❌ " + error.message);
      return false;
    }

    setName("");
    setMsg("✅ Workout created");
    await load();
    return true;
  }

  async function handleCreateConfirm() {
    const ok = await createWorkout();
    if (ok) {
      setShowCreateModal(false);
    }
  }

  function handleCreateCancel() {
    setShowCreateModal(false);
  }

  // פתיחת מודל מחיקה
  function openDeleteModal(workout) {
    setDeleteTarget(workout);
    setShowDeleteModal(true);
  }

  function closeDeleteModal() {
    setShowDeleteModal(false);
    setDeleteTarget(null);
  }

  // מחיקה אמיתית
  async function confirmDelete() {
    if (!deleteTarget?.id) return;
    setMsg("");
    setDeleting(true);

    const { error } = await supabase
      .from("workouts")
      .delete()
      .eq("id", deleteTarget.id);

    setDeleting(false);

    if (error) {
      setMsg("❌ " + error.message);
      return;
    }

    setMsg("✅ Workout deleted");
    closeDeleteModal();
    load();
  }

  return (
    <div className="workouts-page-root">
      <header className="workouts-header">
        <h2 className="workouts-title">My Workouts</h2>
        <p className="workouts-subtitle">
          Create and manage your workout plans
        </p>
      </header>

      {/* כפתור יצירת אימון חדש */}
      <section className="workouts-top-actions">
        <button
          className="workouts-primary-btn"
          onClick={() => setShowCreateModal(true)}
        >
          + Create New Workout
        </button>
        {msg && <p className="workouts-message">{msg}</p>}
      </section>

      {/* רשימת האימונים */}
      <section className="workouts-list-section">
        <ul className="workouts-list">
          {workouts.map((w) => {
            const { exercisesCount, totalSets, muscleGroups } =
              getWorkoutStats(w);

            const createdDate = new Date(w.created_at).toLocaleDateString();

            return (
              <li key={w.id} className="workouts-item">
                {/* header של הכרטיס – לוחצים עליו כדי לפתוח/לסגור */}
                <div
                  className="workouts-item-header"
                  onClick={() =>
                    setExpandedId((prev) => (prev === w.id ? null : w.id))
                  }
                >
                  <div className="workouts-item-main">
                    <div className="workouts-item-name-row">
                      <span className="workouts-item-name">{w.name}</span>
                    </div>

                    {/* תאריך יצירה */}
                    <span className="workouts-item-meta">
                      Created on {createdDate}
                    </span>

                    {/* קבוצות שריר שעובד האימון */}
                    {muscleGroups.length > 0 && (
                      <div className="workouts-item-muscles">
                        {muscleGroups.map((mg) => (
                          <span
                            key={mg}
                            className="workouts-muscle-chip"
                            title={mg}
                          >
                            {mg}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* שורה מתחת – כמות תרגילים וסטים */}
                    <div className="workouts-item-stats">
                      {exercisesCount === 0 ? (
                        <span className="workouts-item-stats-pill">
                          No exercises yet
                        </span>
                      ) : (
                        <>
                          <span className="workouts-item-stats-pill">
                            {exercisesCount}{" "}
                            {exercisesCount === 1 ? "exercise" : "exercises"}
                          </span>
                          <span className="workouts-item-stats-pill">
                            {totalSets} {totalSets === 1 ? "set" : "sets"}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* חץ לפתיחה/סגירה – רק ויזואלי, כל ה-header לחיץ */}
                  <div className="workouts-item-actions">
                    <button
                      type="button"
                      className="workouts-icon-btn workouts-chevron-btn"
                      aria-label={
                        expandedId === w.id
                          ? "Collapse workout"
                          : "Expand workout"
                      }
                    >
                      {expandedId === w.id ? "▴" : "▾"}
                    </button>
                  </div>
                </div>

                {/* רשימת תרגילים – רק כשהכרטיס פתוח */}
                {expandedId === w.id && (
                  <div className="workouts-exercises">
                    {w.exercises.length === 0 ? (
                      <p className="workouts-empty-ex">
                        No exercises yet for this workout.
                      </p>
                    ) : (
                      w.exercises.map((ex) => (
                        <div key={ex.id} className="workouts-ex-row">
                          <span className="workouts-ex-name">
                            {ex.exercise_name}
                          </span>
                          <span className="workouts-ex-summary">
                            {summarizeExerciseTargets(ex.set_targets)}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* שורת אקשנים בתחתית הכרטיס */}
                <div className="workouts-item-footer">
                  <button
                    type="button"
                    className="workouts-icon-btn"
                    title="Edit workout"
                    onClick={() => navigate(`/workouts/${w.id}`)}
                  >
                    ✏️
                  </button>
                  <button
                    type="button"
                    className="workouts-icon-btn workouts-icon-danger"
                    title="Delete workout"
                    onClick={() => openDeleteModal(w)}
                  >
                    🗑
                  </button>
                </div>
              </li>
            );
          })}
        </ul>

        {workouts.length === 0 && (
          <p className="workouts-empty">No workouts yet.</p>
        )}
      </section>

      {/* Pop-up יצירת אימון חדש */}
      {showCreateModal && (
        <div className="workouts-modal-overlay">
          <div className="workouts-modal">
            <h3 className="workouts-modal-title">Create New Workout</h3>
            <p className="workouts-modal-subtitle">
              Give your workout a name. You’ll add exercises next.
            </p>

            <label className="workouts-label" htmlFor="modal-workout-name">
              Workout Name
            </label>
            <input
              id="modal-workout-name"
              className="workouts-input"
              placeholder="e.g. Upper Body Strength"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />

            {msg && <p className="workouts-message">{msg}</p>}

            <div className="workouts-modal-actions">
              <button
                className="workouts-modal-confirm"
                onClick={handleCreateConfirm}
              >
                Continue
              </button>
              <button
                className="workouts-modal-cancel"
                onClick={handleCreateCancel}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pop-up מחיקת אימון */}
      {showDeleteModal && deleteTarget && (
        <div className="workouts-modal-overlay">
          <div className="workouts-modal workouts-modal-danger">
            <h3 className="workouts-modal-title workouts-modal-delete-title">
              Delete workout?
            </h3>
            <p className="workouts-modal-subtitle">
              You are about to delete{" "}
              <strong>{deleteTarget.name}</strong>. This action cannot be
              undone.
            </p>

            <div className="workouts-modal-actions">
              <button
                className="workouts-modal-delete-confirm"
                onClick={confirmDelete}
                disabled={deleting}
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
              <button
                className="workouts-modal-cancel"
                onClick={closeDeleteModal}
                disabled={deleting}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
