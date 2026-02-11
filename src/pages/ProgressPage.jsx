


// src/pages/ProgressPage.jsx
import "../css/progress-page.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

// -----------------------------
// Helpers
// -----------------------------
function formatDateShort(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return String(dateStr);
  // dd.mm.yy style (more compact)
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function formatDateLong(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return String(dateStr);
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function calcSetVolume(weight, reps) {
  const w = Number(weight) || 0;
  const r = Number(reps) || 0;
  return w * r;
}

// exercises_catalog(primary_subgroup_id -> muscle_subgroups -> muscle_groups)
function normalizeExerciseMetaFromCatalog(catalogRow, fallbackName, fallbackId) {
  const sub = catalogRow?.muscle_subgroups || null;
  const grp = sub?.muscle_groups || null;

  return {
    id: fallbackId || catalogRow?.id || null, // IMPORTANT: use sets.exercise_id as truth if present
    name: fallbackName || catalogRow?.name || "Unnamed",
    groupLabel: grp?.label || "",
    subLabel: sub?.label || "",
  };
}

export default function ProgressPage() {
  const { exerciseId } = useParams();

  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]); // [{id,name,groupLabel,subLabel}]
  const [selectedExercise, setSelectedExercise] = useState(null);

  // Variations
  const [variations, setVariations] = useState([]); // [{id,label}]
  const [variationsLoading, setVariationsLoading] = useState(false);
  const [requiresVariation, setRequiresVariation] = useState(false);
  const [selectedVariationId, setSelectedVariationId] = useState("");

  // Data
  const [rawSets, setRawSets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  // UI
  const [recentCountInput, setRecentCountInput] = useState("5");
  const [showVolumeInfo, setShowVolumeInfo] = useState(false);

  // Search UI control
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Chart tooltip
  const [activePoint, setActivePoint] = useState(null); // {session_id,date,volume,x,y,pxX,pxY}
  const pageRef = useRef(null);
  const svgRef = useRef(null);
  const chartWrapRef = useRef(null);

  const needsVariationChoice =
    !!selectedExercise && requiresVariation && !selectedVariationId;

  async function getUserId() {
    const { data: s } = await supabase.auth.getSession();
    return s?.session?.user?.id ?? null;
  }

  const headerMeta = useMemo(() => {
    if (!selectedExercise) return "";
    const parts = [];
    if (selectedExercise.groupLabel) parts.push(selectedExercise.groupLabel);
    if (selectedExercise.subLabel) parts.push(selectedExercise.subLabel);
    return parts.join(" • ");
  }, [selectedExercise]);

  // -----------------------------
  // Close tooltip + dropdown on click outside
  // -----------------------------
  useEffect(() => {
    function onDocMouseDown(e) {
      const root = pageRef.current;
      if (!root) return;

      const clickedInside = root.contains(e.target);

      // Click OUTSIDE page: close everything
      if (!clickedInside) {
        if (activePoint) setActivePoint(null);
        if (isSearchOpen) setIsSearchOpen(false);
        if (suggestions.length) setSuggestions([]);
        return;
      }

      // Click INSIDE page:
      const target = e.target;

      // Close tooltip if clicked not on point or tooltip
      const isPoint = target?.classList?.contains("pg-point");
      const isTooltip = target?.closest?.(".pg-tooltip");
      if (!isPoint && !isTooltip && activePoint) setActivePoint(null);

      // Close suggestions if clicking outside search block
      const isSearch = target?.closest?.(".pg-search-block");
      if (!isSearch) {
        setIsSearchOpen(false);
        setSuggestions([]);
      }
    }

    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [activePoint, isSearchOpen, suggestions.length]);

  // -----------------------------
  // Prefill from URL (only if exercise exists AND user has sets for it)
  // -----------------------------
  useEffect(() => {
    if (!exerciseId) return;

    (async () => {
      const uid = await getUserId();
      if (!uid) {
        setMsg("❌ Not logged in");
        return;
      }

      const { data, error } = await supabase
        .from("sets")
        .select(
          `
          exercise_id,
          exercise_name,
          sessions!inner ( user_id ),
          exercises_catalog (
            id,
            name,
            primary_subgroup_id,
            muscle_subgroups:primary_subgroup_id (
              id,
              label,
              muscle_groups ( id, label )
            )
          )
        `
        )
        .eq("sessions.user_id", uid)
        .eq("exercise_id", exerciseId)
        .limit(1);

      if (error) {
        setMsg("❌ " + error.message);
        return;
      }

      if (!data || data.length === 0) {
        setMsg("This exercise has no logged sets yet.");
        return;
      }

      const r = data[0];
      const meta = normalizeExerciseMetaFromCatalog(
        r.exercises_catalog,
        r.exercise_name,
        r.exercise_id
      );

      setSelectedExercise(meta);
      setQuery(meta.name);
      setSuggestions([]);
      setIsSearchOpen(false);
      setMsg("");
    })();
  }, [exerciseId]);

  // -----------------------------
  // Search suggestions: ONLY exercises user DID (from sets)
  // -----------------------------
  useEffect(() => {
    let alive = true;

    const t = setTimeout(async () => {
      const q = query.trim();

      if (!isSearchOpen) {
        if (suggestions.length) setSuggestions([]);
        return;
      }

      // if selected and query equals selected -> don't spam dropdown
      if (
        selectedExercise?.name &&
        q.toLowerCase() === selectedExercise.name.toLowerCase()
      ) {
        setSuggestions([]);
        return;
      }

      if (q.length < 2) {
        setSuggestions([]);
        return;
      }

      const uid = await getUserId();
      if (!uid) {
        setMsg("❌ Not logged in");
        setSuggestions([]);
        return;
      }

      setMsg("");

      const { data, error } = await supabase
        .from("sets")
        .select(
          `
          exercise_id,
          exercise_name,
          sessions!inner ( user_id ),
          exercises_catalog (
            id,
            name,
            primary_subgroup_id,
            muscle_subgroups:primary_subgroup_id (
              id,
              label,
              muscle_groups ( id, label )
            )
          )
        `
        )
        .eq("sessions.user_id", uid)
        .ilike("exercise_name", `%${q}%`)
        .limit(120);

      if (!alive) return;

      if (error) {
        setMsg("❌ " + error.message);
        setSuggestions([]);
        return;
      }

      // Dedup:
      // - prefer exercise_id if exists
      // - fallback to exercise_name (lower) for legacy rows with null exercise_id
      const uniq = new Map();

      for (const r of data || []) {
        const key = r.exercise_id
          ? `id:${r.exercise_id}`
          : `name:${String(r.exercise_name || "").toLowerCase()}`;
        if (uniq.has(key)) continue;

        const meta = normalizeExerciseMetaFromCatalog(
          r.exercises_catalog,
          r.exercise_name,
          r.exercise_id || null
        );

        if (!meta.id) meta.id = key;

        uniq.set(key, meta);
      }

      setSuggestions([...uniq.values()]);
    }, 220);

    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [query, isSearchOpen, selectedExercise?.name]); // eslint-disable-line react-hooks/exhaustive-deps

  function pickExercise(ex) {
    setSelectedExercise(ex);
    setQuery(ex.name);

    setSuggestions([]);
    setIsSearchOpen(false);

    setMsg("");

    // Reset per-exercise state
    setVariations([]);
    setRequiresVariation(false);
    setSelectedVariationId("");

    setRawSets([]);
    setActivePoint(null);
  }

  // -----------------------------
  // Load variations (DB truth)
  // -----------------------------
  useEffect(() => {
    const exId = selectedExercise?.id;

    const isUuid =
      typeof exId === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        exId
      );

    if (!exId || !isUuid) {
      setVariations([]);
      setRequiresVariation(false);
      setSelectedVariationId("");
      return;
    }

    (async () => {
      setVariationsLoading(true);

      const { data, error } = await supabase
        .from("exercise_variations")
        .select("id,label,sort_order,is_active")
        .eq("exercise_id", exId)
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("label", { ascending: true });

      setVariationsLoading(false);

      if (error) {
        console.error("Failed to load variations", error);
        setVariations([]);
        setRequiresVariation(false);
        setSelectedVariationId("");
        return;
      }

      const arr = (data || []).map((v) => ({ id: v.id, label: v.label }));
      setVariations(arr);

      const req = arr.length > 0;
      setRequiresVariation(req);
      setSelectedVariationId(""); // force explicit selection
    })();
  }, [selectedExercise?.id]);

  const selectedVariationLabel = useMemo(() => {
    if (!requiresVariation) return "";
    return (
      variations.find((v) => String(v.id) === String(selectedVariationId))
        ?.label || ""
    );
  }, [requiresVariation, variations, selectedVariationId]);

  // -----------------------------
  // Fetch sets for selection
  // -----------------------------
  useEffect(() => {
    if (!selectedExercise?.id) {
      setRawSets([]);
      return;
    }

    const exId = selectedExercise.id;
    const isUuid =
      typeof exId === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        exId
      );

    if (requiresVariation && !selectedVariationId) {
      setRawSets([]);
      return;
    }

    (async () => {
      setLoading(true);
      setMsg("");
      setActivePoint(null);

      const uid = await getUserId();
      if (!uid) {
        setLoading(false);
        setMsg("❌ Not logged in");
        return;
      }

      let qb = supabase
        .from("sets")
        .select(
          `
          id,
          session_id,
          exercise_id,
          exercise_name,
          variation_id,
          set_index,
          weight,
          reps,
          created_at,
          sessions!inner ( id, user_id, session_date )
        `
        )
        .eq("sessions.user_id", uid);

      if (isUuid) {
        qb = qb.eq("exercise_id", exId);
      } else {
        qb = qb.eq("exercise_name", selectedExercise.name);
      }

      if (requiresVariation) qb = qb.eq("variation_id", selectedVariationId);

      const { data, error } = await qb.order("created_at", { ascending: true });

      if (error) {
        setMsg("❌ " + error.message);
        setRawSets([]);
        setLoading(false);
        return;
      }

      setRawSets(data || []);
      setLoading(false);
    })();
  }, [
    selectedExercise?.id,
    selectedExercise?.name,
    requiresVariation,
    selectedVariationId,
  ]); // eslint-disable-line react-hooks/exhaustive-deps

  // -----------------------------
  // Series: one point per session_id
  // -----------------------------
  const series = useMemo(() => {
    const bySession = new Map();

    for (const r of rawSets) {
      const sid = r.session_id;
      if (!sid) continue;

      const date = r.sessions?.session_date || null;

      if (!bySession.has(sid)) {
        bySession.set(sid, {
          session_id: sid,
          date,
          sets: [],
          volume: 0,
          prWeight: 0,
        });
      }

      const bucket = bySession.get(sid);
      if (!bucket.date && date) bucket.date = date;

      const set_index = Number(r.set_index) || 1;
      const weight = Number(r.weight) || 0;
      const reps = Number(r.reps) || 0;

      const vol = calcSetVolume(weight, reps);

      bucket.sets.push({
        id: r.id,
        set_index,
        weight,
        reps,
        volume: vol,
      });

      bucket.volume += vol;
      if (weight > bucket.prWeight) bucket.prWeight = weight;
    }

    return [...bySession.values()]
      .map((s) => ({
        ...s,
        sets: [...s.sets].sort(
          (a, b) => (a.set_index || 0) - (b.set_index || 0)
        ),
        volume: Math.round((Number(s.volume) || 0) * 100) / 100,
        prWeight: Math.round((Number(s.prWeight) || 0) * 100) / 100,
      }))
      .sort((a, b) => {
        const da = a.date || "";
        const db = b.date || "";
        const cmp = String(da).localeCompare(String(db));
        if (cmp !== 0) return cmp;
        return String(a.session_id).localeCompare(String(b.session_id));
      });
  }, [rawSets]);

  // -----------------------------
  // Stats
  // -----------------------------
  const stats = useMemo(() => {
    if (!series.length) return null;

    const first = series[0];
    const last = series[series.length - 1];

    const firstVol = Number(first.volume) || 0;
    const lastVol = Number(last.volume) || 0;

    let improvementPct = 0;
    if (series.length > 0 && firstVol > 0) {
      improvementPct = Math.round(((lastVol - firstVol) / firstVol) * 100);
    }

    const sessionsCount = series.length;
    const globalPR = series.reduce(
      (max, s) => Math.max(max, Number(s.prWeight) || 0),
      0
    );

    const d1 = new Date(first.date);
    const d2 = new Date(last.date);
    const diffMs = d2.getTime() - d1.getTime();
    const trackingDays =
      diffMs >= 0 ? Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1 : 1;

    return {
      improvementPct,
      sessionsCount,
      trackingDays,
      prWeight: Math.round(globalPR * 100) / 100,
      firstVol,
      lastVol,
    };
  }, [series]);

  const improvementTone = useMemo(() => {
    if (!stats) return "neutral";
    if (stats.improvementPct > 0) return "up";
    if (stats.improvementPct < 0) return "down";
    return "neutral";
  }, [stats]);

  const improvementLabel = useMemo(() => {
    if (!stats) return "--";
    const v = stats.improvementPct;
    return v > 0 ? `+${v}%` : `${v}%`;
  }, [stats]);

  // PR badge: only FIRST session that hit global PR
  const firstPRSessionId = useMemo(() => {
    if (!series.length || !stats?.prWeight) return null;
    const pr = stats.prWeight;
    const found = series.find((s) => Math.abs((s.prWeight || 0) - pr) < 0.0001);
    return found?.session_id || null;
  }, [series, stats?.prWeight]);

  // -----------------------------
  // Recent Sessions
  // -----------------------------
  const recentMeta = useMemo(() => {
    const total = series.length;
    if (!total) return { total: 0, count: 0, entries: [] };

    const defaultCount = total <= 5 ? total : 5;
    const parsed = Number(recentCountInput);
    const base = !recentCountInput.trim()
      ? defaultCount
      : !Number.isNaN(parsed) && parsed > 0
      ? parsed
      : defaultCount;

    const count = Math.max(1, Math.min(base, total));
    const entries = [...series].slice(-count).reverse();

    return { total, count, entries };
  }, [series, recentCountInput]);

  // -----------------------------
  // Chart (SVG): STRAIGHT line + Area fill
  // -----------------------------
  const chart = useMemo(() => {
    if (!series.length) return null;

    const W = 820;
    const H = 320; // room for axis labels
    const m = { l: 64, r: 16, t: 18, b: 64 };
    const plotW = W - m.l - m.r;
    const plotH = H - m.t - m.b;

    const vals = series.map((s) => Number(s.volume) || 0);
    const minV = Math.min(...vals);
    const maxV = Math.max(...vals);
    const pad = (maxV - minV) * 0.12 || 1;

    const yMin = Math.max(0, Math.floor(minV - pad));
    const yMax = Math.ceil(maxV + pad);

    const xAt = (i) =>
      series.length === 1 ? plotW / 2 : (i * plotW) / (series.length - 1);
    const yAt = (v) => plotH - ((v - yMin) / (yMax - yMin)) * plotH;

    const points = series.map((p, i) => ({
      session_id: p.session_id,
      date: p.date,
      volume: p.volume,
      x: m.l + xAt(i),
      y: m.t + yAt(Number(p.volume) || 0),
    }));

    // Straight line path (goes EXACTLY through points)
    let linePath = "";
    points.forEach((pt, i) => {
      linePath += i === 0 ? `M ${pt.x},${pt.y}` : ` L ${pt.x},${pt.y}`;
    });

    // Area under line
    const baseY = H - m.b;
    const areaPath =
      points.length === 1
        ? `M ${points[0].x},${points[0].y} L ${points[0].x},${baseY} Z`
        : `${linePath} L ${points[points.length - 1].x},${baseY} L ${points[0].x},${baseY} Z`;

    const tickIdx =
      series.length <= 7
        ? series.map((_, i) => i)
        : [
            0,
            Math.floor((series.length - 1) / 3),
            Math.floor(((series.length - 1) * 2) / 3),
            series.length - 1,
          ];

    const yTicks = 4;
    const yVals = Array.from({ length: yTicks + 1 }, (_, i) => {
      return yMin + (i * (yMax - yMin)) / yTicks;
    });

    return { W, H, m, yVals, tickIdx, points, linePath, areaPath };
  }, [series]);

  // Tooltip position (px) - anchored next to clicked point
  const tooltipStyle = useMemo(() => {
    if (!activePoint) return null;

    const wrap = chartWrapRef.current;
    if (!wrap) {
      return { left: (activePoint.pxX ?? 0) + 12, top: (activePoint.pxY ?? 0) - 12 };
    }

    const pad = 10;
    const tipW = 220;
    const tipH = 72;

    const wrapW = wrap.clientWidth;
    const wrapH = wrap.clientHeight;

    let left = (activePoint.pxX ?? 0) + 12;
    let top = (activePoint.pxY ?? 0) - 12;

    if (left + tipW > wrapW - pad) left = (activePoint.pxX ?? 0) - tipW - 12;
    if (top - tipH < pad) top = (activePoint.pxY ?? 0) + 14;

    left = Math.max(pad, Math.min(wrapW - tipW - pad, left));
    top = Math.max(pad, Math.min(wrapH - tipH - pad, top));

    return { left, top };
  }, [activePoint]);

  function onPointClick(p) {
    const svgEl = svgRef.current;
    const wrapEl = chartWrapRef.current;

    if (!svgEl || !wrapEl || !chart) {
      setActivePoint(p);
      return;
    }

    const svgRect = svgEl.getBoundingClientRect();
    const wrapRect = wrapEl.getBoundingClientRect();

    // convert viewBox coords -> rendered px
    const pxX = (p.x / chart.W) * svgRect.width;
    const pxY = (p.y / chart.H) * svgRect.height;

    // tooltip coords relative to wrapper
    const x = svgRect.left - wrapRect.left + pxX;
    const y = svgRect.top - wrapRect.top + pxY;

    setActivePoint({ ...p, pxX: x, pxY: y });
  }

  return (
    <div className="pg-page" ref={pageRef}>
      <header className="pg-header">
        <h1 className="pg-title">Progress</h1>
        <p className="pg-subtitle">See how you improve over time.</p>
      </header>

      {/* Select Exercise */}
      <section className="pg-card pg-select-card">
        <div className="pg-card-title">Select Exercise</div>
        <div className="pg-card-sub">Choose an exercise to view your progress</div>

        <div className="pg-search-block">
          <div className="pg-search">
            <span className="pg-search-icon" aria-hidden="true">🔍</span>
            <input
              className="pg-input"
              placeholder="Search exercises..."
              value={query}
              onFocus={() => setIsSearchOpen(true)}
              onChange={(e) => {
                setQuery(e.target.value);
                setIsSearchOpen(true);
                setMsg("");
              }}
            />
          </div>

          {isSearchOpen && suggestions.length > 0 && (
            <div className="pg-suggestions" role="listbox" aria-label="Exercise suggestions">
              {suggestions.map((ex) => (
                <button
                  key={ex.id}
                  type="button"
                  className="pg-suggestion"
                  onClick={() => pickExercise(ex)}
                >
                  <span className="pg-suggestion-name">{ex.name}</span>
                  {(ex.groupLabel || ex.subLabel) && (
                    <span className="pg-suggestion-meta">
                      {ex.groupLabel}
                      {ex.groupLabel && ex.subLabel ? " • " : ""}
                      {ex.subLabel}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {selectedExercise && (
          <div className="pg-selected-row" aria-label="Selected exercise meta">
            <div className="pg-selected-title">{selectedExercise.name}</div>
            <div className="pg-selected-meta">{headerMeta}</div>
          </div>
        )}

        {selectedExercise && requiresVariation && (
          <div className="pg-variation">
            <label className="pg-field-label">
              Variation{" "}
              {variationsLoading ? <span className="pg-muted">(Loading…)</span> : null}
            </label>

            <select
              className="pg-select"
              value={selectedVariationId}
              onChange={(e) => setSelectedVariationId(e.target.value)}
              disabled={variationsLoading || variations.length === 0}
            >
              <option value="">Choose a variation…</option>
              {variations.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>

            {needsVariationChoice && (
              <div className="pg-hint-warn">
                This exercise has variations — please choose one to view the graph.
              </div>
            )}
          </div>
        )}

        {!requiresVariation && selectedExercise && (
          <div className="pg-hint-ok">No variations for this exercise.</div>
        )}

        {msg && <div className="pg-message">{msg}</div>}
      </section>

      {/* Stats */}
      <section className="pg-stats">
        <div className="pg-stat-card">
          <div className="pg-stat-label">📈 Improvement</div>
          <div className={`pg-stat-value pg-tone-${improvementTone}`}>
            {stats && !needsVariationChoice ? improvementLabel : "--"}
          </div>
          <div className="pg-stat-sub">Volume vs first session</div>
        </div>

        <div className="pg-stat-card">
          <div className="pg-stat-label">🧾 Sessions</div>
          <div className="pg-stat-value">
            {stats && !needsVariationChoice ? stats.sessionsCount : "--"}
          </div>
          <div className="pg-stat-sub">Times you did it</div>
        </div>

        <div className="pg-stat-card">
          <div className="pg-stat-label">📅 Tracking Days</div>
          <div className="pg-stat-value">
            {stats && !needsVariationChoice ? stats.trackingDays : "--"}
          </div>
          <div className="pg-stat-sub">Days of progress</div>
        </div>

        <div className="pg-stat-card">
          <div className="pg-stat-label">🏋️ PR Weight</div>
          <div className="pg-stat-value">
            {stats && !needsVariationChoice ? `${stats.prWeight} kg` : "--"}
          </div>
          <div className="pg-stat-sub">Personal record</div>
        </div>
      </section>

      {/* Chart */}
      <section className="pg-card pg-chart-card">
        <div className="pg-chart-head">
          <div>
            <div className="pg-card-title">Volume Progress</div>
            <div className="pg-card-sub">
              Total volume (kg • reps) per session
              {requiresVariation && selectedVariationLabel ? ` • ${selectedVariationLabel}` : ""}
            </div>
          </div>

          <button
            type="button"
            className="pg-info-btn"
            aria-label="What is volume?"
            onClick={() => setShowVolumeInfo(true)}
          >
            i
          </button>
        </div>

        {loading ? (
          <div className="pg-placeholder">Loading…</div>
        ) : !selectedExercise ? (
          <div className="pg-placeholder">Choose an exercise to see your progress.</div>
        ) : needsVariationChoice ? (
          <div className="pg-placeholder">Choose a variation to see your progress.</div>
        ) : series.length === 0 ? (
          <div className="pg-placeholder">No data yet for this selection.</div>
        ) : (
          <div className="pg-chart-wrap" ref={chartWrapRef}>
            {activePoint && tooltipStyle && (
              <div className="pg-tooltip" style={{ left: tooltipStyle.left, top: tooltipStyle.top }}>
                <div className="pg-tooltip-date">{formatDateLong(activePoint.date)}</div>
                <div className="pg-tooltip-vol">Volume: {activePoint.volume} kg•reps</div>
              </div>
            )}

            <svg
              ref={svgRef}
              viewBox={`0 0 ${chart.W} ${chart.H}`}
              className="pg-chart-svg"
              role="img"
              aria-label="Volume chart"
              onClick={() => {
                if (activePoint) setActivePoint(null);
              }}
            >
              {/* defs for area gradient */}
              <defs>
                <linearGradient id="pgAreaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgba(37, 99, 235, 0.22)" />
                  <stop offset="70%" stopColor="rgba(37, 99, 235, 0.06)" />
                  <stop offset="100%" stopColor="rgba(37, 99, 235, 0.00)" />
                </linearGradient>
              </defs>

              {/* Y axis label */}
              <text
                x={18}
                y={chart.H / 2}
                transform={`rotate(-90 18 ${chart.H / 2})`}
                className="pg-axis-label"
                textAnchor="middle"
              >
                Total Volume (kg•reps)
              </text>

              {/* X axis label */}
              <text
                x={chart.W / 2}
                y={chart.H - 16}
                className="pg-axis-label"
                textAnchor="middle"
              >
                Session Date
              </text>

              {/* grid + y labels */}
              {chart.yVals.map((v, idx) => {
                const t = idx / (chart.yVals.length - 1);
                const Y = chart.m.t + (1 - t) * (chart.H - chart.m.t - chart.m.b);
                return (
                  <g key={`y-${idx}`}>
                    <line
                      x1={chart.m.l}
                      y1={Y}
                      x2={chart.W - chart.m.r}
                      y2={Y}
                      className="pg-grid"
                    />
                    <text
                      x={chart.m.l - 8}
                      y={Y + 4}
                      textAnchor="end"
                      className="pg-ylabel"
                    >
                      {Math.round(v)}
                    </text>
                  </g>
                );
              })}

              {/* x axis */}
              <line
                x1={chart.m.l}
                y1={chart.H - chart.m.b}
                x2={chart.W - chart.m.r}
                y2={chart.H - chart.m.b}
                className="pg-axis"
              />

              {chart.tickIdx.map((i) => {
                const p = chart.points[i];
                return (
                  <g
                    key={`x-${p.session_id}-${i}`}
                    transform={`translate(${p.x}, ${chart.H - chart.m.b + 18})`}
                  >
                    <text textAnchor="middle" className="pg-xlabel">
                      {formatDateShort(p.date)}
                    </text>
                  </g>
                );
              })}

              {/* area */}
              <path d={chart.areaPath} className="pg-area" />

              {/* line (straight) */}
              <path d={chart.linePath} className="pg-line" fill="none" />

              {/* points */}
              {chart.points.map((p) => (
                <g key={p.session_id}>
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r="5"
                    className={`pg-point ${
                      activePoint?.session_id === p.session_id ? "pg-point--active" : ""
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onPointClick(p);
                    }}
                  />
                </g>
              ))}
            </svg>
          </div>
        )}
      </section>

      {/* Recent Sessions */}
      {selectedExercise && !needsVariationChoice && series.length > 0 && (
        <section className="pg-card pg-recent-card">
          <div className="pg-recent-head">
            <div className="pg-card-title">Recent Sessions</div>

            <div className="pg-recent-control">
              <span className="pg-muted">Show last</span>
              <input
                className="pg-recent-input"
                type="number"
                min="1"
                value={recentCountInput}
                onChange={(e) => setRecentCountInput(e.target.value)}
              />
              <span className="pg-muted">sessions</span>
            </div>
          </div>

          <div className="pg-recent-list">
            {recentMeta.entries.map((sesh) => {
              const isFirstPRSession =
                firstPRSessionId && sesh.session_id === firstPRSessionId;

              return (
                <div key={sesh.session_id} className="pg-recent-item">
                  <div className="pg-recent-row">
                    <div>
                      <div className="pg-recent-date">{formatDateLong(sesh.date)}</div>
                      <div className="pg-recent-sub">Volume: {sesh.volume} kg•reps</div>
                    </div>

                    {isFirstPRSession && <div className="pg-pr-pill">PR</div>}
                  </div>

                  <div className="pg-set-pills">
                    {sesh.sets.map((st) => (
                      <div key={st.id} className="pg-set-pill">
                        {st.weight}kg × {st.reps}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Volume info modal */}
      {showVolumeInfo && (
        <div className="pg-modal-backdrop" role="dialog" aria-modal="true">
          <div className="pg-modal">
            <div className="pg-modal-head">
              <div>
                <div className="pg-modal-title">What is Volume?</div>
                <div className="pg-modal-sub">Understanding volume in your workout tracking</div>
              </div>
              <button
                className="pg-modal-close"
                aria-label="Close"
                onClick={() => setShowVolumeInfo(false)}
              >
                ✕
              </button>
            </div>

            <div className="pg-modal-body">
              <h3 className="pg-h3">What is Volume?</h3>
              <p className="pg-p">
                Volume is the total work performed in a session, combining the weight you lift and the
                number of repetitions you complete.
              </p>

              <h3 className="pg-h3">How it’s calculated</h3>
              <div className="pg-codebox">
                <div><strong>Per set:</strong> weight × reps</div>
                <div><strong>Per session:</strong> sum of all sets</div>
              </div>

              <div className="pg-example">
                <div className="pg-example-title">Example</div>
                <ul className="pg-ul">
                  <li>Set 1: 20 kg × 10 reps = 200 kg•reps</li>
                  <li>Set 2: 25 kg × 8 reps = 200 kg•reps</li>
                </ul>
                <div className="pg-example-total">
                  Session Volume = <strong>400 kg•reps</strong>
                </div>
              </div>

              <h3 className="pg-h3">Why track volume?</h3>
              <p className="pg-p">
                Volume helps you measure overall progress even when weight or reps vary between sets.
                Increasing volume over time usually indicates you’re getting stronger.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
