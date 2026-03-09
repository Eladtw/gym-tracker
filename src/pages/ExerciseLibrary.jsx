// src/pages/ExerciseLibrary.jsx
import "../css/exercise-library.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";

function getImageUrl(imagePath) {
  if (!imagePath) return null;
  if (imagePath.startsWith("http")) return imagePath;

  // אם שמרת רק את שם הקובץ ב־image_path
  const { data } = supabase.storage
    .from("exercise-images")
    .getPublicUrl(imagePath);

  return data?.publicUrl || null;
}

// עוזר: בדיקת מספר חיובי
const isPosNum = (v) => v !== "" && Number.isFinite(Number(v)) && Number(v) > 0;

// Image Viewer Modal Component
function ImageViewerModal({ open, imageUrl, title, onClose }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div 
      className="el-image-viewer-overlay" 
      role="dialog" 
      aria-modal="true"
      onClick={onClose}
    >
      <div className="el-image-viewer-content" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="el-image-viewer-close"
          onClick={onClose}
          aria-label="Close"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
        
        {imageUrl ? (
          <img 
            className="el-image-viewer-img" 
            src={imageUrl} 
            alt={title || "Exercise image"} 
          />
        ) : (
          <div className="el-image-viewer-empty">No image available</div>
        )}
        
        {title && <div className="el-image-viewer-title">{title}</div>}
      </div>
    </div>
  );
}

export default function ExerciseLibrary() {
  const [loading, setLoading] = useState(true);
  const [exercises, setExercises] = useState([]);
  const [muscleGroups, setMuscleGroups] = useState([]);
  const [muscleSubgroups, setMuscleSubgroups] = useState([]);
  const [equipments, setEquipments] = useState([]);

  const [filterGroup, setFilterGroup] = useState("all");
  const [filterSubgroup, setFilterSubgroup] = useState("all");
  const [filterEquipment, setFilterEquipment] = useState("all");

  const [selectedExercise, setSelectedExercise] = useState(null);

  // Image Viewer state
  const [imageViewerOpen, setImageViewerOpen] = useState(false);
  const [imageViewerUrl, setImageViewerUrl] = useState("");
  const [imageViewerTitle, setImageViewerTitle] = useState("");

  const openImageViewer = useCallback((imageUrl, title) => {
    setImageViewerUrl(imageUrl);
    setImageViewerTitle(title);
    setImageViewerOpen(true);
  }, []);

  const closeImageViewer = useCallback(() => {
    setImageViewerOpen(false);
    setImageViewerUrl("");
    setImageViewerTitle("");
  }, []);

  const [workouts, setWorkouts] = useState([]);
  const [selectedWorkoutId, setSelectedWorkoutId] = useState(null);

  // שלב 2 – תכנון סטים
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [planSetsCount, setPlanSetsCount] = useState("");
  const [planSetRows, setPlanSetRows] = useState([{ reps: "", weight: "" }]);
  const [savingPlan, setSavingPlan] = useState(false);

  // Create new exercise state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newExerciseName, setNewExerciseName] = useState("");
  const [newYoutubeUrl, setNewYoutubeUrl] = useState("");
  const [newPrimarySubgroupId, setNewPrimarySubgroupId] = useState("");
  const [newEquipmentId, setNewEquipmentId] = useState("");
  const [creatingExercise, setCreatingExercise] = useState(false);
  const [createError, setCreateError] = useState("");

  // ------------------------------------------------
  // טענת כל הדאטה מה־DB
  // ------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    async function loadAll() {
      setLoading(true);

      try {
        // 1) קבוצות שריר
        const { data: groups, error: gErr } = await supabase
          .from("muscle_groups")
          .select("id, key, label");
        if (gErr) throw gErr;

        const groupsById = {};
        const groupList = (groups || []).map((g) => {
          groupsById[g.id] = g;
          return { id: g.id, key: g.key, label: g.label };
        });

        // 2) תת-קבוצות
        const { data: subs, error: sErr } = await supabase
          .from("muscle_subgroups")
          .select("id, key, label, group_id");
        if (sErr) throw sErr;

        const subgroupsById = {};
        const subgroupList = (subs || []).map((s) => {
          const group = groupsById[s.group_id];
          const groupKey = group?.key || null;
          const groupLabel = group?.label || "";
          const sg = {
            id: s.id,
            key: s.key,
            label: s.label,
            groupId: s.group_id,
            groupKey,
            groupLabel,
          };
          subgroupsById[sg.id] = sg;
          return sg;
        });

        // 3) ציוד
        const { data: eqRows, error: eqErr } = await supabase
          .from("equipment")
          .select("id, key, label")
          .order("label", { ascending: true });
        if (eqErr) throw eqErr;

        const equipmentList = (eqRows || []).map((e) => ({
          id: e.id,
          key: e.key,
          label: e.label,
        }));

        // 4) Target Muscles
        const { data: targets, error: tErr } = await supabase
          .from("exercise_muscle_targets")
          .select("exercise_id, role, subgroup_id");
        if (tErr) throw tErr;

        const targetsByExercise = {};
        (targets || []).forEach((t) => {
          if (!targetsByExercise[t.exercise_id]) {
            targetsByExercise[t.exercise_id] = [];
          }
          targetsByExercise[t.exercise_id].push(t);
        });

        // 5) תרגילים
        // חשוב:
        // - לא מסננים לפי image_path כדי שלא נקבל 0
        // - מביאים join ל-equipment דרך equipment_id
        const { data: ex, error: eErr } = await supabase
          .from("exercises_catalog")
          .select(
            `
            id,
            name,
            youtube_url,
            image_path,
            primary_subgroup_id,
            equipment_id,
            equipment:equipment_id (
              id,
              key,
              label
            )
          `
          )
          .order("name", { ascending: true });

        if (eErr) throw eErr;

        const normalizedExercises = (ex || []).map((row) => {
          const primarySub = row.primary_subgroup_id
            ? subgroupsById[row.primary_subgroup_id]
            : null;

          const primaryGroupKey = primarySub?.groupKey || null;
          const primaryGroupLabel = primarySub?.groupLabel || "";
          const primarySubKey = primarySub?.key || null;
          const primarySubLabel = primarySub?.label || "";

          const exerciseTargets = targetsByExercise[row.id] || [];
          const secondaryMuscles = exerciseTargets
            .filter((t) => t.role === "secondary")
            .map((t) => {
              const sg = subgroupsById[t.subgroup_id];
              if (!sg) return null;
              return {
                groupKey: sg.groupKey,
                groupLabel: sg.groupLabel,
                subgroupKey: sg.key,
                subgroupLabel: sg.label,
              };
            })
            .filter(Boolean);

          const equipmentKey = row.equipment?.key || "other";
          const equipmentLabel = row.equipment?.label || "Other";

          return {
            id: row.id,
            name: row.name,
            youtubeUrl: row.youtube_url,
            equipmentKey,
            equipmentLabel,
            imagePath: row.image_path,
            imageUrl: getImageUrl(row.image_path),
            primaryGroupKey,
            primaryGroupLabel,
            primarySubKey,
            primarySubLabel,
            secondaryMuscles,
          };
        });

        // 6) אימונים + כמות תרגילים בכל אימון
        const { data: workoutsRows, error: wErr } = await supabase
          .from("workouts")
          .select("id, name, user_id");
        if (wErr) throw wErr;

        const { data: workoutExercises, error: weErr } = await supabase
          .from("workout_exercises")
          .select("id, workout_id");
        if (weErr) throw weErr;

        const countByWorkout = {};
        (workoutExercises || []).forEach((we) => {
          countByWorkout[we.workout_id] =
            (countByWorkout[we.workout_id] || 0) + 1;
        });

        const normalizedWorkouts = (workoutsRows || []).map((w) => ({
          id: w.id,
          name: w.name,
          exerciseCount: countByWorkout[w.id] || 0,
        }));

        if (!cancelled) {
          setMuscleGroups(groupList);
          setMuscleSubgroups(subgroupList);
          setEquipments(equipmentList);
          setExercises(normalizedExercises);
          setWorkouts(normalizedWorkouts);
        }
      } catch (err) {
        console.error("Error loading exercise library", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadAll();

    return () => {
      cancelled = true;
    };
  }, []);

  // ------------------------------------------------
  // פילטור לפי Muscle Group / Subgroup / Equipment
  // ------------------------------------------------

  const availableSubgroups = useMemo(() => {
    if (filterGroup === "all") return muscleSubgroups;
    return muscleSubgroups.filter((sg) => sg.groupKey === filterGroup);
  }, [muscleSubgroups, filterGroup]);

  const filteredExercises = useMemo(() => {
    return exercises.filter((ex) => {
      if (filterGroup !== "all" && ex.primaryGroupKey !== filterGroup) {
        return false;
      }
      if (filterSubgroup !== "all" && ex.primarySubKey !== filterSubgroup) {
        return false;
      }
      if (filterEquipment !== "all" && ex.equipmentKey !== filterEquipment) {
        return false;
      }
      return true;
    });
  }, [exercises, filterGroup, filterSubgroup, filterEquipment]);

  const totalCount = exercises.length;
  const filteredCount = filteredExercises.length;

  // ------------------------------------------------
  // עזר לשלבי הסטים
  // ------------------------------------------------

  function resetPlanState() {
    setIsPlanModalOpen(false);
    setPlanSetsCount("");
    setPlanSetRows([{ reps: "", weight: "" }]);
    setSavingPlan(false);
  }

  function onPlanSetsChange(v) {
    setPlanSetsCount(v);
    const n = Math.max(0, Number(v) || 0);
    if (n <= 0) {
      setPlanSetRows([{ reps: "", weight: "" }]);
      return;
    }
    setPlanSetRows((prev) => {
      const copy = prev.slice(0, n);
      while (copy.length < n) copy.push({ reps: "", weight: "" });
      return copy;
    });
  }

  function updatePlanRow(idx, field, value) {
    setPlanSetRows((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r))
    );
  }

  const canBuildPlan =
    Number.isInteger(Number(planSetsCount)) && Number(planSetsCount) > 0;

  const allPlanRowsValid =
    canBuildPlan &&
    planSetRows.length === Number(planSetsCount) &&
    planSetRows.every((r) => isPosNum(r.reps) && isPosNum(r.weight));

  function buildSetTargetsPayload() {
    const n = Number(planSetsCount) || 0;
    const arr = [];
    for (let i = 0; i < n; i++) {
      const r = planSetRows[i] || { reps: "", weight: "" };
      arr.push({
        set_index: i + 1,
        reps: Number(r.reps),
        weight: Number(r.weight),
      });
    }
    return arr;
  }

  // ------------------------------------------------
  // Create New Exercise functions
  // ------------------------------------------------

  // Group subgroups by muscle group for better display
  const subgroupsByGroup = useMemo(() => {
    const map = new Map();
    for (const sg of muscleSubgroups) {
      const groupObj = muscleGroups.find(g => g.id === sg.groupId);
      const gLabel = groupObj?.label || "Other";
      if (!map.has(gLabel)) map.set(gLabel, []);
      map.get(gLabel).push(sg);
    }
    return Array.from(map.entries()).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  }, [muscleSubgroups, muscleGroups]);

  function resetCreateState() {
    setNewExerciseName("");
    setNewYoutubeUrl("");
    setNewPrimarySubgroupId("");
    setNewEquipmentId("");
    setCreatingExercise(false);
    setCreateError("");
  }

  function openCreateModal() {
    resetCreateState();
    setIsCreateModalOpen(true);
  }

  function closeCreateModal() {
    setIsCreateModalOpen(false);
    resetCreateState();
  }

  async function handleCreateExercise() {
    setCreateError("");

    const name = newExerciseName.trim();
    if (!name) {
      setCreateError("Please enter an exercise name");
      return;
    }
    if (!newPrimarySubgroupId) {
      setCreateError("Please select a primary muscle");
      return;
    }

    setCreatingExercise(true);

    try {
      // Get current user
      const { data: s } = await supabase.auth.getSession();
      const uid = s?.session?.user?.id;
      if (!uid) {
        setCreateError("You must be logged in to create exercises");
        setCreatingExercise(false);
        return;
      }

      // Check for duplicates
      const { data: existed, error: eDup } = await supabase
        .from("exercises_catalog")
        .select("id, name")
        .eq("owner_id", uid)
        .ilike("name", name)
        .limit(5);

      if (eDup) {
        setCreateError(eDup.message);
        setCreatingExercise(false);
        return;
      }

      if ((existed || []).some(
        (x) => (x.name || "").trim().toLowerCase() === name.toLowerCase()
      )) {
        setCreateError("You already have an exercise with this name");
        setCreatingExercise(false);
        return;
      }

      // Create exercise
      const { data: ex, error: e1 } = await supabase
        .from("exercises_catalog")
        .insert({
          owner_id: uid,
          name: name,
          youtube_url: newYoutubeUrl || null,
          primary_subgroup_id: newPrimarySubgroupId,
          equipment_id: newEquipmentId || null,
        })
        .select("id, name")
        .single();

      if (e1) {
        setCreateError(e1.code === "23505" ? "Exercise already exists" : e1.message);
        setCreatingExercise(false);
        return;
      }

      // Create muscle target mapping
      const { error: eTarget } = await supabase
        .from("exercise_muscle_targets")
        .insert({
          exercise_id: ex.id,
          subgroup_id: newPrimarySubgroupId,
          role: "primary",
        });

      if (eTarget) {
        // Rollback exercise creation
        try {
          await supabase.from("exercises_catalog").delete().eq("id", ex.id);
        } catch {
          // ignore
        }
        setCreateError("Failed to save muscle mapping: " + eTarget.message);
        setCreatingExercise(false);
        return;
      }

      // Success - reload exercises and close modal
      closeCreateModal();
      
      // Reload exercises to include the new one
      const { data: newExData } = await supabase
        .from("exercises_catalog")
        .select(`
          id,
          name,
          youtube_url,
          image_path,
          primary_subgroup_id,
          equipment_id,
          equipment:equipment_id (
            id,
            key,
            label
          )
        `)
        .eq("id", ex.id)
        .single();

      if (newExData) {
        const primarySub = muscleSubgroups.find(s => s.id === newExData.primary_subgroup_id);
        const primaryGroup = primarySub ? muscleGroups.find(g => g.id === primarySub.groupId) : null;

        const newEx = {
          id: newExData.id,
          name: newExData.name,
          youtubeUrl: newExData.youtube_url,
          equipmentKey: newExData.equipment?.key || "other",
          equipmentLabel: newExData.equipment?.label || "Other",
          imagePath: newExData.image_path,
          imageUrl: getImageUrl(newExData.image_path),
          primaryGroupKey: primaryGroup?.key || null,
          primaryGroupLabel: primaryGroup?.label || "",
          primarySubKey: primarySub?.key || null,
          primarySubLabel: primarySub?.label || "",
          secondaryMuscles: [],
        };

        setExercises(prev => [newEx, ...prev]);
      }

    } catch (err) {
      console.error("Unexpected error creating exercise:", err);
      setCreateError("An unexpected error occurred");
      setCreatingExercise(false);
    }
  }

  // ------------------------------------------------
  // Modal: Add to workout – שלב 1: בחירת אימון
  // ------------------------------------------------

  function handleOpenPlanModal() {
    if (!selectedExercise || !selectedWorkoutId) return;
    // ברירת מחדל – 3 סטים למשל
    setPlanSetsCount("3");
    setPlanSetRows([
      { reps: "", weight: "" },
      { reps: "", weight: "" },
      { reps: "", weight: "" },
    ]);
    setIsPlanModalOpen(true);
  }

  // שלב 2 – שמירת הסטים והוספת התרגיל לאימון
  async function handleSavePlanAndAttach() {
    if (!selectedExercise || !selectedWorkoutId) return;
    if (!allPlanRowsValid) return;

    const workout = workouts.find((w) => w.id === selectedWorkoutId);
    const orderIndex = workout?.exerciseCount ?? 0;
    const setTargets = buildSetTargetsPayload();

    try {
      setSavingPlan(true);

      const { error } = await supabase.from("workout_exercises").insert({
        workout_id: selectedWorkoutId,
        exercise_id: selectedExercise.id,
        exercise_name: selectedExercise.name,
        set_targets: setTargets,
        order_index: orderIndex,
      });

      if (error) {
        console.error("Error adding exercise to workout:", error);
        alert(error.message);
        setSavingPlan(false);
        return;
      }

      // עדכון כמות התרגילים באימון המקומי
      setWorkouts((prev) =>
        prev.map((w) =>
          w.id === selectedWorkoutId
            ? { ...w, exerciseCount: (w.exerciseCount || 0) + 1 }
            : w
        )
      );

      // סגירת שני המודאלים
      resetPlanState();
      setSelectedExercise(null);
      setSelectedWorkoutId(null);
    } catch (err) {
      console.error("Unexpected error:", err);
      alert("Failed to add exercise to workout.");
      setSavingPlan(false);
    }
  }

  return (
    <div className="el-page">
      <header className="el-header">
        <div className="el-header-top">
          <div>
            <h1 className="el-title">Exercise Library</h1>
            <p className="el-subtitle">
              Discover and explore exercises for your training goals.
            </p>
          </div>
          <button
            type="button"
            className="el-create-btn"
            onClick={openCreateModal}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            <span>Create Exercise</span>
          </button>
        </div>
      </header>

      <div className="el-layout">
        {/* סינונים */}
        <section className="el-filters-card">
          <div className="el-filters-header">
            <div className="el-filters-title-row">
              <span className="el-filters-icon">⏱</span>
              <span className="el-filters-title">Filter Exercises</span>
            </div>
            <button
              type="button"
              className="el-reset-btn"
              onClick={() => {
                setFilterGroup("all");
                setFilterSubgroup("all");
                setFilterEquipment("all");
              }}
            >
              Reset All
            </button>
          </div>

          <div className="el-filters-body">
            <div className="el-field">
              <label className="el-field-label">Muscle Group</label>
              <select
                className="el-select"
                value={filterGroup}
                onChange={(e) => {
                  const val = e.target.value;
                  setFilterGroup(val);
                  setFilterSubgroup("all");
                }}
              >
                <option value="all">All</option>
                {muscleGroups.map((g) => (
                  <option key={g.id} value={g.key}>
                    {g.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="el-field">
              <label className="el-field-label">Muscle Subgroup</label>
              <select
                className="el-select"
                value={filterSubgroup}
                onChange={(e) => setFilterSubgroup(e.target.value)}
              >
                <option value="all">All</option>
                {availableSubgroups.map((sg) => (
                  <option key={sg.id} value={sg.key}>
                    {sg.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="el-field">
              <label className="el-field-label">Equipment</label>
              <select
                className="el-select"
                value={filterEquipment}
                onChange={(e) => setFilterEquipment(e.target.value)}
              >
                <option value="all">All</option>
                {equipments.map((eq) => (
                  <option key={eq.id} value={eq.key}>
                    {eq.label}
                  </option>
                ))}
                <option value="other">Other</option>
              </select>
            </div>
          </div>
        </section>

        {/* רשימת תרגילים */}
        <section className="el-list-section">
          <div className="el-list-header">
            {loading ? (
              <span className="el-list-caption">Loading exercises…</span>
            ) : (
              <span className="el-list-caption">
                Showing {filteredCount} of {totalCount} exercises
              </span>
            )}
          </div>

          <div className="el-grid">
            {!loading && filteredExercises.length === 0 && (
              <p className="el-empty-state">
                No exercises match your filters. Try adjusting the filters.
              </p>
            )}

            {filteredExercises.map((ex) => (
              <button
                key={ex.id}
                type="button"
                className="el-card"
                onClick={() => {
                  setSelectedExercise(ex);
                  setSelectedWorkoutId(null);
                  resetPlanState();
                }}
              >
                <div className="el-card-image-wrap">
                  {ex.imageUrl ? (
                    <img
                      src={ex.imageUrl}
                      alt={ex.name}
                      className="el-card-image"
                    />
                  ) : (
                    <div className="el-card-image-placeholder">No Image</div>
                  )}
                </div>

                <div className="el-card-body">
                  <h3 className="el-card-title">{ex.name}</h3>

                  <div className="el-card-tags-row">
                    {ex.primaryGroupLabel && (
                      <span className="el-tag el-tag-group">
                        {ex.primaryGroupLabel}
                      </span>
                    )}
                    {ex.primarySubLabel && (
                      <span className="el-tag el-tag-subgroup">
                        {ex.primarySubLabel}
                      </span>
                    )}
                    {ex.equipmentLabel && (
                      <span className="el-tag el-tag-equipment">
                        {ex.equipmentLabel}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>
      </div>

      {/* מודאל תרגיל – שלב 1: בחירת אימון */}
      {selectedExercise && !isPlanModalOpen && (
        <div className="el-modal-overlay">
          <div className="el-modal">
            <div className="el-modal-image-header">
              {selectedExercise.imageUrl && (
                <img
                  src={selectedExercise.imageUrl}
                  alt={selectedExercise.name}
                  className="el-modal-image el-modal-image-clickable"
                  onClick={() => openImageViewer(selectedExercise.imageUrl, selectedExercise.name)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openImageViewer(selectedExercise.imageUrl, selectedExercise.name);
                    }
                  }}
                />
              )}

              <button
                type="button"
                className="el-modal-close"
                aria-label="Close"
                onClick={() => {
                  setSelectedExercise(null);
                  setSelectedWorkoutId(null);
                  resetPlanState();
                }}
              >
                ✕
              </button>

              <div className="el-modal-image-gradient" />

              <div className="el-modal-image-content">
                <div className="el-modal-chips-row">
                  {selectedExercise.primaryGroupLabel && (
                    <span className="el-tag el-tag-group">
                      {selectedExercise.primaryGroupLabel}
                    </span>
                  )}
                  {selectedExercise.primarySubLabel && (
                    <span className="el-tag el-tag-subgroup">
                      {selectedExercise.primarySubLabel}
                    </span>
                  )}
                  {selectedExercise.equipmentLabel && (
                    <span className="el-tag el-tag-equipment">
                      {selectedExercise.equipmentLabel}
                    </span>
                  )}
                </div>
                <h2 className="el-modal-title">{selectedExercise.name}</h2>
              </div>
            </div>

            <div className="el-modal-body">
              {/* Primary muscle */}
              <section className="el-modal-section">
                <div className="el-modal-card el-modal-primary-card">
                  <div className="el-modal-card-icon">🎯</div>
                  <div className="el-modal-card-text">
                    <div className="el-modal-card-label">
                      Primary Target Muscle
                    </div>
                    <div className="el-modal-card-value">
                      {selectedExercise.primarySubLabel ||
                        selectedExercise.primaryGroupLabel ||
                        "—"}
                    </div>
                  </div>
                </div>
              </section>

              {/* Secondary muscles */}
              <section className="el-modal-section">
                <div className="el-modal-card">
                  <div className="el-modal-card-icon el-secondary-icon">
                    ⚡
                  </div>
                  <div className="el-modal-card-text">
                    <div className="el-modal-card-label">Secondary Muscles</div>
                    <div className="el-secondary-pills">
                      {selectedExercise.secondaryMuscles.length === 0 && (
                        <span className="el-secondary-empty">None listed</span>
                      )}
                      {selectedExercise.secondaryMuscles.map((m, idx) => (
                        <span key={idx} className="el-secondary-pill">
                          {m.subgroupLabel}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              {/* קישור ל־YouTube אם קיים */}
              {selectedExercise.youtubeUrl && (
                <section className="el-modal-section">
                  <a
                    href={selectedExercise.youtubeUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="el-youtube-link"
                  >
                    Watch tutorial on YouTube
                  </a>
                </section>
              )}

              {/* Add to workout – שלב 1 */}
              <section className="el-modal-section el-add-section">
                <div className="el-add-header">
                  <div className="el-add-title-row">
                    <span className="el-add-plus">+</span>
                    <span className="el-add-title">Add to Workout</span>
                  </div>
                </div>

                <div className="el-workout-list">
                  {workouts.length === 0 && (
                    <p className="el-empty-workouts">
                      You don&apos;t have any workouts yet.
                    </p>
                  )}

                  {workouts.map((w) => (
                    <label
                      key={w.id}
                      className={`el-workout-item ${
                        selectedWorkoutId === w.id
                          ? "el-workout-item--active"
                          : ""
                      }`}
                    >
                      <div className="el-workout-main">
                        <div className="el-workout-name">{w.name}</div>
                        <div className="el-workout-sub">
                          {w.exerciseCount} exercises
                        </div>
                      </div>
                      <div className="el-workout-radio-wrap">
                        <input
                          type="radio"
                          name="workout-select"
                          checked={selectedWorkoutId === w.id}
                          onChange={() => setSelectedWorkoutId(w.id)}
                        />
                      </div>
                    </label>
                  ))}
                </div>

                <button
                  type="button"
                  className="el-add-button"
                  disabled={!selectedWorkoutId}
                  onClick={handleOpenPlanModal}
                >
                  {selectedWorkoutId ? "Next: Sets & Reps" : "Select a Workout"}
                </button>
              </section>
            </div>
          </div>
        </div>
      )}

      {/* מודאל שלב 2 – סטים / חזרות / משקל - עיצוב משופר */}
      {selectedExercise && isPlanModalOpen && (
        <div className="el-modal-overlay">
          <div className="el-modal el-plan-modal">
            {/* Header עם תמונה קטנה של התרגיל */}
            <div className="el-plan-header-new">
              <button
                type="button"
                className="el-plan-back-new"
                onClick={() => setIsPlanModalOpen(false)}
                aria-label="Back"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="15,18 9,12 15,6"></polyline>
                </svg>
              </button>
              
              <div className="el-plan-header-info">
                {selectedExercise.imageUrl && (
                  <div className="el-plan-header-thumb">
                    <img src={selectedExercise.imageUrl} alt="" />
                  </div>
                )}
                <div className="el-plan-header-text">
                  <h2 className="el-plan-exercise-name">{selectedExercise.name}</h2>
                  <p className="el-plan-workout-name">
                    Adding to{" "}
                    <strong>
                      {(workouts.find((w) => w.id === selectedWorkoutId) || {}).name}
                    </strong>
                  </p>
                </div>
              </div>

              <button
                type="button"
                className="el-plan-close-new"
                aria-label="Close"
                onClick={() => {
                  setSelectedExercise(null);
                  setSelectedWorkoutId(null);
                  resetPlanState();
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>

            <div className="el-plan-body-new">
              {/* Quick set selector */}
              <div className="el-plan-quick-sets">
                <span className="el-plan-quick-label">Quick select:</span>
                <div className="el-plan-quick-buttons">
                  {[3, 4, 5].map((num) => (
                    <button
                      key={num}
                      type="button"
                      className={`el-plan-quick-btn ${planSetsCount === String(num) ? 'active' : ''}`}
                      onClick={() => onPlanSetsChange(String(num))}
                    >
                      {num} sets
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom sets input */}
              <div className="el-plan-sets-input-wrap">
                <label className="el-plan-sets-label">Number of sets</label>
                <input
                  className="el-plan-sets-input"
                  type="number"
                  min={1}
                  max={10}
                  inputMode="numeric"
                  placeholder="3"
                  value={planSetsCount}
                  onChange={(e) => onPlanSetsChange(e.target.value)}
                />
              </div>

              {/* Set cards */}
              {canBuildPlan && (
                <div className="el-plan-sets-grid">
                  <div className="el-plan-sets-header">
                    <span className="el-plan-col-set">Set</span>
                    <span className="el-plan-col-reps">Reps</span>
                    <span className="el-plan-col-weight">Weight (kg)</span>
                  </div>
                  
                  {planSetRows.map((row, idx) => (
                    <div key={idx} className="el-plan-set-card">
                      <div className="el-plan-set-number">{idx + 1}</div>
                      <div className="el-plan-set-field">
                        <input
                          className="el-plan-field-input"
                          type="number"
                          min={1}
                          inputMode="numeric"
                          placeholder="12"
                          value={row.reps}
                          onChange={(e) => updatePlanRow(idx, "reps", e.target.value)}
                        />
                      </div>
                      <div className="el-plan-set-field">
                        <input
                          className="el-plan-field-input"
                          type="number"
                          min={0}
                          step="0.5"
                          inputMode="decimal"
                          placeholder="20"
                          value={row.weight}
                          onChange={(e) => updatePlanRow(idx, "weight", e.target.value)}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {!allPlanRowsValid && canBuildPlan && (
                <p className="el-plan-error-new">
                  Please fill in reps and weight for all sets
                </p>
              )}
            </div>

            {/* Footer with CTA */}
            <div className="el-plan-footer-new">
              <button
                type="button"
                className="el-plan-cancel-new"
                onClick={() => {
                  setSelectedExercise(null);
                  setSelectedWorkoutId(null);
                  resetPlanState();
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="el-plan-confirm-new"
                disabled={!allPlanRowsValid || savingPlan}
                onClick={handleSavePlanAndAttach}
              >
                {savingPlan ? (
                  <>
                    <span className="el-plan-spinner"></span>
                    Adding...
                  </>
                ) : (
                  <>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="20,6 9,17 4,12"></polyline>
                    </svg>
                    Add to Workout
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Viewer Modal */}
      <ImageViewerModal
        open={imageViewerOpen}
        imageUrl={imageViewerUrl}
        title={imageViewerTitle}
        onClose={closeImageViewer}
      />
    </div>
  );
}
