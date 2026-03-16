import { supabase } from "./supabaseClient";

function getTodayISO() {
  return new Date().toISOString().split("T")[0];
}

export async function startOrResumeWorkoutSession(workoutId) {
  const { data: auth } = await supabase.auth.getSession();
  const uid = auth?.session?.user?.id;
  if (!uid || !workoutId) return { error: "Not logged in" };

  const todayISO = getTodayISO();

  const { data: existing, error: existingError } = await supabase
    .from("sessions")
    .select("id")
    .eq("user_id", uid)
    .eq("workout_id", workoutId)
    .eq("session_date", todayISO)
    .is("ended_at", null)
    .order("created_at", { ascending: false })
    .limit(1);

  if (existingError) return { error: existingError.message };

  if (existing?.length) {
    return { sessionId: existing[0].id, resumed: true, dateISO: todayISO };
  }

  const { data, error } = await supabase
    .from("sessions")
    .insert({
      user_id: uid,
      workout_id: workoutId,
      session_date: todayISO,
      started_at: new Date().toISOString(),
      ended_at: null,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  return { sessionId: data.id, resumed: false, dateISO: todayISO };
}

export async function getActiveSessionForUser() {
  const { data: auth } = await supabase.auth.getSession();
  const uid = auth?.session?.user?.id;
  if (!uid) return null;

  const { data, error } = await supabase
    .from("sessions")
    .select("id")
    .eq("user_id", uid)
    .is("ended_at", null)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error || !data?.length) return null;
  return data[0];
}
