export const workoutHistoryItems = [
  {
    id: "upper-body-power-2023-10-24",
    name: "Upper Body Power",
    dateLabel: "Oct 24",
    duration: "1h 15m",
    status: "Personal Best",
    statusTone: "positive",
    muscleGroups: ["Chest", "Triceps"],
    exercisesCount: 6,
    setsCount: 18,
  },
  {
    id: "push-day-focus-2023-10-21",
    name: "Push Day Focus",
    dateLabel: "Oct 21",
    duration: "58m",
    status: "Improved",
    statusTone: "positive",
    muscleGroups: ["Chest", "Shoulders"],
    exercisesCount: 5,
    setsCount: 15,
  },
  {
    id: "legs-core-2023-10-18",
    name: "Legs & Core",
    dateLabel: "Oct 18",
    duration: "1h 25m",
    status: "Maintained",
    statusTone: "neutral",
    muscleGroups: ["Quads", "Hamstrings", "Core"],
    exercisesCount: 7,
    setsCount: 21,
  },
  {
    id: "full-body-burn-2023-10-15",
    name: "Full Body Burn",
    dateLabel: "Oct 15",
    duration: "45m",
    status: "Declined",
    statusTone: "negative",
    muscleGroups: ["HIIT", "Cardio"],
    exercisesCount: 12,
    setsCount: null,
  },
];

export const workoutHistoryDetailMock = {
  id: "push-day-focus-2023-10-21",
  title: "Push Day",
  subtitle: "Oct 12, 2023 • 1h 15m",
  muscles: ["Chest", "Shoulders", "Triceps"],
  summary: {
    totalExercises: "6",
    totalExercisesDelta: "+1 vs last",
    totalVolume: "4,850 lbs",
    totalVolumeDelta: "+525 vs last",
  },
  improvementsTop: [
    { name: "Incline Dumbbell Press", area: "Chest > Upper Chest", value: "85 lbs", delta: "+5 lbs vs last" },
    { name: "Overhead Press", area: "Shoulders > Front Delts", value: "135 lbs", delta: "+10 lbs vs last" },
    { name: "Tricep Pushdown", area: "Triceps > Long Head", value: "60 lbs", delta: "+2.5 lbs vs last" },
  ],
};

export const allImprovementsMock = [
  {
    id: "incline-dumbbell-press",
    name: "Incline Dumbbell Press",
    group: "Chest",
    fromTo: "60 lbs → 65 lbs",
    delta: "+5 lbs",
    rows: [
      { set: "1", prev: "10 x 60", current: "10 x 65", delta: "+5 lbs" },
      { set: "2", prev: "8 x 60", current: "10 x 65", delta: "+2 reps" },
      { set: "3", prev: "8 x 60", current: "9 x 65", delta: "+5 lbs" },
    ],
  },
  {
    id: "barbell-squat",
    name: "Barbell Squat",
    group: "Legs",
    fromTo: "225 lbs → 235 lbs",
    delta: "+10 lbs",
    rows: [
      { set: "1", prev: "5 x 225", current: "5 x 235", delta: "+10 lbs" },
      { set: "2", prev: "5 x 225", current: "5 x 235", delta: "+10 lbs" },
    ],
  },
  {
    id: "lateral-raises",
    name: "Lateral Raises",
    group: "Shoulders",
    fromTo: "15 lbs → 20 lbs",
    delta: "+5 lbs",
    rows: [
      { set: "1", prev: "12 x 15", current: "12 x 20", delta: "+5 lbs" },
      { set: "2", prev: "12 x 15", current: "14 x 20", delta: "+2 reps" },
    ],
  },
  {
    id: "overhead-tricep-extension",
    name: "Overhead Tricep Extension",
    group: "Triceps",
    fromTo: "40 lbs → 42.5 lbs",
    delta: "+2.5 lbs",
    rows: [{ set: "1", prev: "10 x 40", current: "10 x 42.5", delta: "+2.5 lbs" }],
  },
  {
    id: "seated-cable-row",
    name: "Seated Cable Row",
    group: "Back",
    fromTo: "120 lbs → 130 lbs",
    delta: "+10 lbs",
    rows: [{ set: "1", prev: "10 x 120", current: "10 x 130", delta: "+10 lbs" }],
  },
];

export const workoutLogMock = [
  {
    id: "incline-dumbbell-press-log",
    name: "Incline Dumbbell Press",
    area: "Chest > Upper Chest • Dumbbells",
    setsLabel: "4 Sets",
    rows: [
      { set: "1", prev: "60x10", curr: "65x10", deltaWeight: "+5 lbs", deltaRep: "-", isPositiveRep: false },
      { set: "2", prev: "60x8", curr: "65x8", deltaWeight: "+5 lbs", deltaRep: "-", isPositiveRep: false },
      { set: "3", prev: "60x8", curr: "60x9", deltaWeight: "-", deltaRep: "+1 rep", isPositiveRep: true },
      { set: "4", prev: "60x8", curr: "60x8", deltaWeight: "-", deltaRep: "-", isPositiveRep: false },
    ],
  },
  {
    id: "flat-barbell-bench-press-log",
    name: "Flat Barbell Bench Press",
    area: "Chest > Mid Chest • Barbell",
    setsLabel: "2 Sets",
    rows: [
      { set: "1", prev: "135x12", curr: "135x12", deltaWeight: "-", deltaRep: "-", isPositiveRep: false },
      { set: "2", prev: "185x8", curr: "185x7", deltaWeight: "-", deltaRep: "-1 rep", isPositiveRep: false, isNegativeRep: true },
    ],
  },
];
