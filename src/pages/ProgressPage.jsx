// // src/pages/ProgressPage.jsx
// import "../css/progress-page.css";
// import { useEffect, useMemo, useState, useRef } from "react";
// import { useParams } from "react-router-dom";
// import { supabase } from "../lib/supabaseClient";

// // -----------------------------
// // Helpers: exercise meta
// // -----------------------------

// function normalizeExerciseFromCatalog(row) {
//   const primarySub = row?.muscle_subgroups || null;
//   const primaryGroup = primarySub?.muscle_groups || null;

//   return {
//     id: row?.id,
//     name: row?.name || "Unnamed",
//     primarySubgroupId: row?.primary_subgroup_id || null,

//     primaryGroupKey: primaryGroup?.key || null,
//     primaryGroupLabel: primaryGroup?.label || null,

//     primarySubKey: primarySub?.key || null,
//     primarySubLabel: primarySub?.label || null,
//   };
// }

// // -----------------------------
// // Normalize a single set row
// // -----------------------------
// function normalizeSetRow(r) {
//   return {
//     id: r.id, // ✅ unique key for rendering
//     session_id: r.session_id,
//     date:
//       r.sessions?.session_date ||
//       (r.created_at ? r.created_at.slice(0, 10) : null),
//     set_index: Number(r.set_index) || 0,
//     weight: Number(r.weight) || 0,
//     reps: Number(r.reps) || 0,
//   };
// }

// function formatDateShort(dateStr) {
//   if (!dateStr) return "";
//   const d = new Date(dateStr);
//   if (Number.isNaN(d.getTime())) return dateStr;
//   return d.toLocaleDateString(undefined, {
//     month: "short",
//     day: "numeric",
//   });
// }

// function formatDateLong(dateStr) {
//   if (!dateStr) return "";
//   const d = new Date(dateStr);
//   if (Number.isNaN(d.getTime())) return dateStr;
//   return d.toLocaleDateString(undefined, {
//     year: "numeric",
//     month: "short",
//     day: "numeric",
//   });
// }

// function buildTooltip(entry) {
//   const lines = [];
//   lines.push(formatDateLong(entry.date));
//   lines.push(`Volume: ${entry.volume} kg·reps`);
//   if (entry.sets?.length) {
//     lines.push("Sets:");
//     entry.sets.forEach((s) => {
//       const label = s.set_index || "?";
//       const vol = s.weight * s.reps;
//       lines.push(`${label}: ${s.weight} kg × ${s.reps} = ${vol} kg·reps`);
//     });
//   }
//   return lines.join("\n");
// }

// export default function ProgressPage() {
//   const { exerciseId } = useParams(); // /progress/id/:exerciseId

//   const [query, setQuery] = useState("");
//   const [suggestions, setSuggestions] = useState([]);
//   const [selected, setSelected] = useState(null);

//   // ✅ Variations (by exercise)
//   const [variations, setVariations] = useState([]); // [{id,label,sort_order}]
//   const [variationsLoading, setVariationsLoading] = useState(false);
//   const [selectedVariationId, setSelectedVariationId] = useState(""); // "" | uuid
//   const [requiresVariation, setRequiresVariation] = useState(false); // ✅ DB-truth

//   const [rawSets, setRawSets] = useState([]);
//   const [loading, setLoading] = useState(false);
//   const [msg, setMsg] = useState("");

//   const [showVolumeInfo, setShowVolumeInfo] = useState(false);

//   // טקסט בשדה "כמה אימונים להציג"
//   const [recentInput, setRecentInput] = useState("5");

//   // keep selected stable while typing/searching
//   const selectedRef = useRef(null);
//   useEffect(() => {
//     selectedRef.current = selected;
//   }, [selected]);

//   // ✅ Helps prevent older async responses from overriding new selection
//   const fetchTokenRef = useRef(0);

//   const selectedVariationLabel = useMemo(() => {
//     if (!variations.length) return "";
//     const v = variations.find(
//       (x) => String(x.id) === String(selectedVariationId)
//     );
//     return v?.label || "";
//   }, [variations, selectedVariationId]);

//   const needsVariationChoice =
//     !!selected && requiresVariation && !selectedVariationId;

//   // ------------------------------------------------
//   // Load variations for selected exercise (DB truth)
//   // ------------------------------------------------
//   async function loadVariationsForExercise(exId) {
//     if (!exId) {
//       setVariations([]);
//       setSelectedVariationId("");
//       setRequiresVariation(false);
//       return;
//     }

//     setVariationsLoading(true);

//     const { data, error } = await supabase
//       .from("exercise_variations")
//       .select("id,label,sort_order,is_active")
//       .eq("exercise_id", exId)
//       .eq("is_active", true)
//       .order("sort_order", { ascending: true })
//       .order("label", { ascending: true });

//     setVariationsLoading(false);

//     if (error) {
//       console.error("Failed to load variations", error);
//       setVariations([]);
//       setSelectedVariationId("");
//       setRequiresVariation(false);
//       return;
//     }

//     const arr = (data || []).map((v) => ({
//       id: v.id,
//       label: v.label,
//       sort_order: v.sort_order ?? 0,
//     }));

//     setVariations(arr);

//     // ✅ DB truth: if variations exist -> must pick variation
//     const req = arr.length > 0;
//     setRequiresVariation(req);

//     // ✅ Force explicit user choice when variations exist
//     setSelectedVariationId("");
//   }

//   // ------------------------------------------------
//   // Prefill from URL exerciseId
//   // ------------------------------------------------
//   useEffect(() => {
//     if (!exerciseId) return;

//     (async () => {
//       const { data, error } = await supabase
//         .from("exercises_catalog")
//         .select(
//           `
//           id,
//           name,
//           primary_subgroup_id,
//           muscle_subgroups:primary_subgroup_id (
//             id,
//             key,
//             label,
//             muscle_groups (
//               id,
//               key,
//               label
//             )
//           )
//         `
//         )
//         .eq("id", exerciseId)
//         .single();

//       if (error || !data) {
//         setMsg("Could not load exercise from URL.");
//         return;
//       }

//       const ex = normalizeExerciseFromCatalog(data);

//       setSelected(ex);
//       setQuery(ex.name);
//       setSuggestions([]);
//     })();
//   }, [exerciseId]);

//   // ------------------------------------------------
//   // Search: only exercises the user actually logged
//   // (unique by exercise_id)
//   // ------------------------------------------------
//   useEffect(() => {
//     const t = setTimeout(async () => {
//       const q = query.trim();
//       if (q.length < 2) {
//         setSuggestions([]);
//         return;
//       }

//       const { data: s } = await supabase.auth.getSession();
//       const uid = s?.session?.user?.id ?? null;
//       if (!uid) {
//         setMsg("❌ Not logged in");
//         setSuggestions([]);
//         return;
//       }

//       const { data, error } = await supabase
//         .from("sets")
//         .select(
//           `
//           exercise_id,
//           exercise_name,
//           sessions!inner ( user_id ),
//           exercises_catalog (
//             id,
//             name,
//             primary_subgroup_id,
//             muscle_subgroups:primary_subgroup_id (
//               id,
//               key,
//               label,
//               muscle_groups (
//                 id,
//                 key,
//                 label
//               )
//             )
//           )
//         `
//         )
//         .eq("sessions.user_id", uid)
//         .not("exercise_id", "is", null)
//         .ilike("exercise_name", `%${q}%`)
//         .limit(50);

//       if (error) {
//         setMsg("❌ " + error.message);
//         setSuggestions([]);
//         return;
//       }

//       const uniq = new Map();
//       for (const r of data || []) {
//         const id = r.exercise_id;
//         if (!id) continue;
//         if (!uniq.has(id)) {
//           const catalog = r.exercises_catalog || {};
//           const exNorm = normalizeExerciseFromCatalog({
//             ...catalog,
//             id,
//             name: r.exercise_name || catalog?.name,
//           });
//           uniq.set(id, exNorm);
//         }
//       }

//       setSuggestions([...uniq.values()]);
//     }, 200);

//     return () => clearTimeout(t);
//   }, [query]);

//   function pickSuggestion(ex) {
//     // selecting exercise
//     setSelected(ex);
//     setQuery(ex.name);
//     setSuggestions([]);

//     // reset view state for new selection
//     setRawSets([]);
//     setMsg("");

//     // reset variations and requirement before loading
//     setVariations([]);
//     setSelectedVariationId("");
//     setRequiresVariation(false);

//     // bump token to invalidate older pending fetches
//     fetchTokenRef.current += 1;
//   }

//   // ------------------------------------------------
//   // When selected exercise changes -> load variations
//   // ------------------------------------------------
//   useEffect(() => {
//     if (!selected?.id) {
//       setVariations([]);
//       setSelectedVariationId("");
//       setRequiresVariation(false);
//       return;
//     }
//     loadVariationsForExercise(selected.id);
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, [selected?.id]);

//   // ------------------------------------------------
//   // Fetch sets for selected exercise (+ MUST variation if required)
//   // ------------------------------------------------
//   useEffect(() => {
//     if (!selected?.id) {
//       setRawSets([]);
//       return;
//     }

//     // ✅ If DB says variations exist -> enforce selection
//     if (requiresVariation && !selectedVariationId) {
//       setRawSets([]);
//       return;
//     }

//     const token = ++fetchTokenRef.current;

//     (async () => {
//       setLoading(true);
//       setMsg("");

//       const { data: s } = await supabase.auth.getSession();
//       const uid = s?.session?.user?.id;
//       if (!uid) {
//         if (fetchTokenRef.current === token) {
//           setLoading(false);
//           setMsg("❌ Not logged in");
//         }
//         return;
//       }

//       let qb = supabase
//         .from("sets")
//         .select(
//           `
//           id,
//           session_id,
//           exercise_id,
//           exercise_name,
//           variation_id,
//           weight,
//           reps,
//           set_index,
//           created_at,
//           sessions!inner ( id, user_id, session_date )
//         `
//         )
//         .eq("exercise_id", selected.id)
//         .eq("sessions.user_id", uid);

//       // ✅ If variations exist -> ALWAYS filter by selected variation_id
//       if (requiresVariation) {
//         qb = qb.eq("variation_id", selectedVariationId);
//       }

//       const { data, error } = await qb.order("created_at", { ascending: true });

//       // ignore stale responses
//       if (fetchTokenRef.current !== token) return;

//       if (error) {
//         setMsg("❌ " + error.message);
//         setRawSets([]);
//         setLoading(false);
//         return;
//       }

//       setRawSets(data || []);
//       setLoading(false);
//     })();
//   }, [selected?.id, requiresVariation, selectedVariationId]);

//   // ------------------------------------------------
//   // Aggregate by SESSION (not by date) ✅ fixes duplicates + better accuracy
//   // ------------------------------------------------
//   const series = useMemo(() => {
//     const map = new Map(); // session_id -> { date, sets: [] }

//     for (const r of rawSets) {
//       const n = normalizeSetRow(r);
//       if (!n.session_id) continue;

//       const key = String(n.session_id);
//       if (!map.has(key))
//         map.set(key, { session_id: key, date: n.date, sets: [] });
//       const bucket = map.get(key);

//       if (!bucket.date && n.date) bucket.date = n.date;
//       bucket.sets.push(n);
//     }

//     const arr = [];
//     for (const v of [...map.values()].sort((a, b) => {
//       const da = a.date || "";
//       const db = b.date || "";
//       const cmp = da.localeCompare(db);
//       if (cmp !== 0) return cmp;
//       return String(a.session_id).localeCompare(String(b.session_id));
//     })) {
//       let volume = 0;
//       let prWeight = 0;

//       const sets = [...v.sets].sort(
//         (a, b) => (a.set_index || 0) - (b.set_index || 0)
//       );

//       sets.forEach((s) => {
//         volume += s.weight * s.reps;
//         if (s.weight > prWeight) prWeight = s.weight;
//       });

//       arr.push({
//         session_id: v.session_id,
//         date: v.date,
//         volume,
//         prWeight,
//         count_sets: sets.length,
//         sets,
//       });
//     }

//     return arr;
//   }, [rawSets]);

//   // ------------------------------------------------
//   // Top stats
//   // ------------------------------------------------
//   const stats = useMemo(() => {
//     if (!series.length) return null;

//     const first = series[0];
//     const last = series[series.length - 1];

//     const firstVol = first.volume || 0;
//     const lastVol = last.volume || 0;
//     let improvement = 0;
//     if (series.length > 1 && firstVol > 0) {
//       improvement = Math.round(((lastVol - firstVol) / firstVol) * 100);
//     }

//     const prWeight = rawSets.reduce(
//       (max, r) => Math.max(max, Number(r.weight) || 0),
//       0
//     );

//     const sessionsCount = series.length;

//     const firstDate = new Date(first.date);
//     const lastDate = new Date(last.date);
//     const diffMs = lastDate.getTime() - firstDate.getTime();
//     const trackingDays =
//       diffMs >= 0 ? Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1 : 1;

//     return { improvement, prWeight, sessionsCount, trackingDays };
//   }, [series, rawSets]);

//   // ------------------------------------------------
//   // Volume chart SVG
//   // ------------------------------------------------
//   const chartSvg = useMemo(() => {
//     const data = series;
//     if (!data.length) return null;

//     const vals = data.map((d) => Number(d.volume) || 0);
//     const minV = Math.min(...vals);
//     const maxV = Math.max(...vals);
//     const pad = (maxV - minV) * 0.1 || 1;
//     const yMin = Math.max(0, Math.floor(minV - pad));
//     const yMax = Math.ceil(maxV + pad);

//     const W = 800;
//     const H = 280;
//     const m = { l: 56, r: 16, t: 16, b: 40 };
//     const plotW = W - m.l - m.r;
//     const plotH = H - m.t - m.b;

//     const x = (i) =>
//       data.length === 1 ? plotW / 2 : (i * plotW) / (data.length - 1);
//     const y = (v) => plotH - ((v - yMin) / (yMax - yMin)) * plotH;

//     let linePath = "";
//     let areaPath = "";

//     data.forEach((p, i) => {
//       const X = m.l + x(i);
//       const Y = m.t + y(Number(p.volume) || 0);
//       if (i === 0) {
//         linePath = `M ${X},${Y}`;
//         areaPath = `M ${X},${H - m.b} L ${X},${Y}`;
//       } else {
//         linePath += ` L ${X},${Y}`;
//         areaPath += ` L ${X},${Y}`;
//       }
//       if (i === data.length - 1) {
//         areaPath += ` L ${X},${H - m.b} Z`;
//       }
//     });

//     const tickIdx =
//       data.length <= 6
//         ? data.map((_, i) => i)
//         : [
//             0,
//             Math.floor((data.length - 1) / 3),
//             Math.floor(((data.length - 1) * 2) / 3),
//             data.length - 1,
//           ];

//     const yTicks = 4;
//     const yVals = Array.from({ length: yTicks + 1 }, (_, i) => {
//       return yMin + (i * (yMax - yMin)) / yTicks;
//     });

//     return (
//       <svg
//         viewBox={`0 0 ${W} ${H}`}
//         className="xp-chart-svg"
//         aria-label="Volume progression chart"
//       >
//         <defs>
//           <linearGradient id="xpVolumeGradient" x1="0" y1="0" x2="0" y2="1">
//             <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.3" />
//             <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.03" />
//           </linearGradient>
//         </defs>

//         {/* horizontal grid + Y labels */}
//         {yVals.map((v, idx) => {
//           const Y = m.t + y(v);
//           return (
//             <g key={`y-${idx}`}>
//               <line
//                 x1={m.l}
//                 y1={Y}
//                 x2={W - m.r}
//                 y2={Y}
//                 className="xp-chart-grid"
//               />
//               <text
//                 x={m.l - 8}
//                 y={Y + 4}
//                 textAnchor="end"
//                 className="xp-chart-y-label"
//               >
//                 {Math.round(v)}
//               </text>
//             </g>
//           );
//         })}

//         {/* X axis */}
//         <line
//           x1={m.l}
//           y1={H - m.b}
//           x2={W - m.r}
//           y2={H - m.b}
//           className="xp-chart-axis"
//         />
//         {tickIdx.map((i) => {
//           const X = m.l + x(i);
//           const label = formatDateShort(data[i].date);
//           // ✅ ensure unique + stable keys even when re-rendered
//           const k = data[i]?.session_id
//             ? `x-${data[i].session_id}`
//             : `x-i-${i}`;
//           return (
//             <g
//               key={k}
//               transform={`translate(${X}, ${H - m.b + 18})`}
//             >
//               <text textAnchor="middle" className="xp-chart-x-label">
//                 {label}
//               </text>
//             </g>
//           );
//         })}

//         {/* area under line */}
//         <path
//           d={areaPath}
//           className="xp-chart-area"
//           fill="url(#xpVolumeGradient)"
//         />

//         {/* line */}
//         <path d={linePath} className="xp-chart-line" fill="none" />

//         {/* points */}
//         {data.map((p, i) => {
//           const X = m.l + x(i);
//           const Y = m.t + y(Number(p.volume) || 0);
//           const tooltip = buildTooltip(p);
//           const k = p?.session_id ? `pt-${p.session_id}` : `pt-i-${i}`;
//           return (
//             <g key={k}>
//               <circle cx={X} cy={Y} r="4" className="xp-chart-point">
//                 <title>{tooltip}</title>
//               </circle>
//             </g>
//           );
//         })}
//       </svg>
//     );
//   }, [series]);

//   // ------------------------------------------------
//   // Recent sessions meta
//   // ------------------------------------------------
//   const recentMeta = useMemo(() => {
//     const total = series.length;
//     if (!total) return { total: 0, count: 0, entries: [] };

//     const defaultCount = total <= 5 ? total : 5;

//     let baseCount;
//     if (!recentInput.trim()) {
//       baseCount = defaultCount;
//     } else {
//       const num = Number(recentInput);
//       baseCount = !Number.isNaN(num) && num > 0 ? num : defaultCount;
//     }

//     let count = baseCount;
//     if (count > total) count = total;
//     if (count < 1) count = 1;

//     const entries = [...series].slice(-count).reverse();
//     return { total, count, entries };
//   }, [series, recentInput]);

//   const improvementLabel =
//     stats &&
//     (stats.improvement > 0 ? `+${stats.improvement}%` : `${stats.improvement}%`);

//   // ------------------------------------------------
//   // UI
//   // ------------------------------------------------
//   return (
//     <div className="xp-page">
//       <header className="xp-header">
//         <h1 className="xp-title">Exercise Progress</h1>
//         <p className="xp-subtitle">
//           Track your strength gains and monitor improvement over time.
//         </p>
//       </header>

//       {/* Exercise selector + metric cards */}
//       <section className="xp-top-section">
//         <div className="xp-select-column">
//           <div className="xp-card xp-select-card">
//             <label className="xp-field-label">Select Exercise</label>

//             <div className="xp-search-wrapper">
//               <input
//                 className="xp-input"
//                 placeholder="Search exercises… (2+ chars)"
//                 value={query}
//                 onChange={(e) => {
//                   // typing should not unselect current view
//                   setQuery(e.target.value);
//                   setMsg("");
//                 }}
//               />

//               {suggestions.length > 0 && (
//                 <div className="xp-suggestions">
//                   {suggestions.map((ex) => (
//                     <button
//                       key={ex.id}
//                       type="button"
//                       className="xp-suggestion-item"
//                       onClick={() => pickSuggestion(ex)}
//                     >
//                       <span className="xp-suggestion-main">
//                         {ex.name}
//                         {ex.primaryGroupLabel && (
//                           <span className="xp-chip xp-chip-small">
//                             {ex.primaryGroupLabel}
//                           </span>
//                         )}
//                         {ex.primarySubLabel && (
//                           <span className="xp-chip xp-chip-small">
//                             {ex.primarySubLabel}
//                           </span>
//                         )}
//                       </span>
//                     </button>
//                   ))}
//                 </div>
//               )}
//             </div>

//             {selected && (
//               <div className="xp-selected-card">
//                 <div className="xp-selected-name">{selected.name}</div>

//                 <div className="xp-selected-meta">
//                   {selected.primaryGroupLabel && (
//                     <span className="xp-chip">{selected.primaryGroupLabel}</span>
//                   )}
//                   {selected.primarySubLabel && (
//                     <span className="xp-chip">{selected.primarySubLabel}</span>
//                   )}

//                   {requiresVariation && (
//                     <span className="xp-chip">
//                       Var: {selectedVariationLabel || "Choose…"}
//                     </span>
//                   )}

//                   {stats && !needsVariationChoice && (
//                     <span className="xp-selected-current">
//                       Current: {stats.prWeight} kg
//                     </span>
//                   )}
//                 </div>

//                 {/* ✅ Variation dropdown (must choose if variations exist) */}
//                 {requiresVariation && (
//                   <div style={{ marginTop: 10 }}>
//                     <label
//                       className="xp-field-label"
//                       style={{ marginBottom: 6 }}
//                     >
//                       Variation {variationsLoading ? "(Loading…)" : ""}
//                     </label>

//                     <select
//                       className="xp-input"
//                       value={selectedVariationId}
//                       onChange={(e) => {
//                         setSelectedVariationId(e.target.value);
//                         // bump token so any in-flight fetch doesn't overwrite
//                         fetchTokenRef.current += 1;
//                       }}
//                       disabled={variationsLoading || variations.length === 0}
//                     >
//                       <option value="">Choose a variation…</option>

//                       {variations.map((v) => (
//                         <option key={v.id} value={v.id}>
//                           {v.label}
//                         </option>
//                       ))}
//                     </select>

//                     <div
//                       style={{
//                         marginTop: 6,
//                         fontSize: "0.8rem",
//                         color: "#6b7280",
//                       }}
//                     >
//                       This exercise has variations — progress is shown only after
//                       choosing one.
//                     </div>
//                   </div>
//                 )}

//                 {needsVariationChoice && (
//                   <p className="xp-message">
//                     Please choose a variation to view progress.
//                   </p>
//                 )}
//               </div>
//             )}

//             {msg && <p className="xp-message">{msg}</p>}
//           </div>
//         </div>

//         <div className="xp-summary-column">
//           <div className="xp-summary-grid">
//             <div className="xp-card xp-summary-card xp-summary-card--green">
//               <div className="xp-summary-icon">↗</div>
//               <div className="xp-summary-text">
//                 <div className="xp-summary-label">Improvement</div>
//                 <div className="xp-summary-value">
//                   {stats && !needsVariationChoice ? improvementLabel : "--"}
//                 </div>
//               </div>
//             </div>

//             <div className="xp-card xp-summary-card xp-summary-card--blue">
//               <div className="xp-summary-icon">📅</div>
//               <div className="xp-summary-text">
//                 <div className="xp-summary-label">Sessions</div>
//                 <div className="xp-summary-value">
//                   {stats && !needsVariationChoice ? stats.sessionsCount : "--"}
//                 </div>
//               </div>
//             </div>

//             <div className="xp-card xp-summary-card xp-summary-card--purple">
//               <div className="xp-summary-icon">⏱</div>
//               <div className="xp-summary-text">
//                 <div className="xp-summary-label">Tracking</div>
//                 <div className="xp-summary-value">
//                   {stats && !needsVariationChoice
//                     ? `${stats.trackingDays} days`
//                     : "--"}
//                 </div>
//               </div>
//             </div>

//             <div className="xp-card xp-summary-card xp-summary-card--gold">
//               <div className="xp-summary-icon">🏋</div>
//               <div className="xp-summary-text">
//                 <div className="xp-summary-label">PR Weight</div>
//                 <div className="xp-summary-value">
//                   {stats && !needsVariationChoice ? `${stats.prWeight} kg` : "--"}
//                 </div>
//               </div>
//             </div>
//           </div>
//         </div>
//       </section>

//       {/* Volume chart */}
//       <section className="xp-card xp-volume-card">
//         <div className="xp-volume-header">
//           <div className="xp-volume-title-row">
//             <h2 className="xp-section-title">Volume Progress</h2>
//             <button
//               type="button"
//               className="xp-info-btn"
//               aria-label="What is volume?"
//               onClick={() => setShowVolumeInfo(true)}
//             >
//               i
//             </button>
//             <span className="xp-tag">Strength</span>
//           </div>

//           <p className="xp-volume-caption">
//             {selected && stats && !needsVariationChoice
//               ? requiresVariation
//                 ? `Your ${selected.name} (${selectedVariationLabel}) volume improvement over the last ${stats.trackingDays} days.`
//                 : `Your ${selected.name} volume improvement over the last ${stats.trackingDays} days.`
//               : selected && requiresVariation
//               ? `Choose a variation to view progress for ${selected.name}.`
//               : "Select an exercise to see volume progression over time."}
//           </p>
//         </div>

//         {loading ? (
//           <p className="xp-placeholder">Loading…</p>
//         ) : !selected ? (
//           <p className="xp-placeholder">Choose an exercise to see your progress.</p>
//         ) : needsVariationChoice ? (
//           <p className="xp-placeholder">Choose a variation to see your progress.</p>
//         ) : series.length === 0 ? (
//           <p className="xp-placeholder">
//             No data yet for this {requiresVariation ? "variation" : "exercise"}.
//             Log some sets and come back.
//           </p>
//         ) : (
//           <div className="xp-chart-wrapper">
//             {chartSvg}
//             <div className="xp-chart-legend">
//               <span className="xp-dot" />
//               <span>Total Volume per Session</span>
//             </div>
//           </div>
//         )}
//       </section>

//       {/* Recent sessions */}
//       {selected && !needsVariationChoice && series.length > 0 && (
//         <section className="xp-card xp-recent-card">
//           <div className="xp-recent-header-row">
//             <div>
//               <h2 className="xp-section-title">Recent Sessions</h2>
//               <p className="xp-section-sub">
//                 {recentMeta.total > 0
//                   ? `Showing ${recentMeta.count} of ${recentMeta.total} total sessions`
//                   : "No sessions yet for this exercise."}
//               </p>
//             </div>
//             <div>
//               <input
//                 type="number"
//                 min="1"
//                 className="xp-input xp-recent-count-input"
//                 placeholder="5"
//                 value={recentInput}
//                 onChange={(e) => {
//                   setRecentInput(e.target.value);
//                 }}
//               />
//             </div>
//           </div>

//           <div className="xp-recent-list">
//             {recentMeta.entries.map((entry) => (
//               <article key={entry.session_id} className="xp-recent-item">
//                 <div className="xp-recent-top">
//                   <div className="xp-recent-date-block">
//                     <div className="xp-recent-date-icon">📅</div>
//                     <div>
//                       <div className="xp-recent-date-text">
//                         {formatDateLong(entry.date)}
//                       </div>
//                       <div className="xp-recent-subline">
//                         {entry.count_sets} sets · {entry.volume} kg·reps volume
//                       </div>
//                     </div>
//                   </div>
//                   {stats && entry.prWeight === stats.prWeight && (
//                     <span className="xp-pr-pill">PR</span>
//                   )}
//                 </div>

//                 <div className="xp-recent-sets">
//                   {entry.sets.map((s) => (
//                     <div key={s.id} className="xp-recent-set-pill">
//                       <span className="xp-recent-set-label">
//                         Set {s.set_index}
//                       </span>
//                       <span className="xp-recent-set-value">
//                         {s.weight} kg × {s.reps}
//                       </span>
//                     </div>
//                   ))}
//                 </div>
//               </article>
//             ))}
//           </div>
//         </section>
//       )}

//       {/* Volume info modal */}
//       {showVolumeInfo && (
//         <div className="xp-modal-overlay" role="dialog" aria-modal="true">
//           <div className="xp-modal">
//             <div className="xp-modal-header">
//               <h2 className="xp-modal-title">What is Volume?</h2>
//               <button
//                 type="button"
//                 className="xp-modal-close"
//                 aria-label="Close"
//                 onClick={() => setShowVolumeInfo(false)}
//               >
//                 ✕
//               </button>
//             </div>

//             <div className="xp-modal-body">
//               <p className="xp-modal-text">
//                 Volume is a key metric in strength training that measures the
//                 total amount of work you've done in a workout session.
//               </p>

//               <div className="xp-modal-box">
//                 <div className="xp-modal-formula-title">How it's calculated:</div>
//                 <div className="xp-modal-formula">
//                   Volume = Weight × Reps × Sets
//                 </div>
//               </div>

//               <div className="xp-modal-box xp-modal-example">
//                 <div className="xp-modal-formula-title">Example:</div>
//                 <ul className="xp-modal-list">
//                   <li>Set 1: 150 kg × 8 reps = 1,200 kg·reps</li>
//                   <li>Set 2: 150 kg × 7 reps = 1,050 kg·reps</li>
//                   <li>Set 3: 150 kg × 6 reps = 900 kg·reps</li>
//                 </ul>
//                 <div className="xp-modal-total">
//                   Total Volume: <strong>3,150 kg·reps</strong>
//                 </div>
//               </div>

//               <p className="xp-modal-text">
//                 Tracking volume helps you measure overall progress even when
//                 weight or reps vary between sets. Increasing volume over time
//                 usually indicates you're getting stronger.
//               </p>
//             </div>
//           </div>
//         </div>
//       )}
//     </div>
//   );
// }





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
