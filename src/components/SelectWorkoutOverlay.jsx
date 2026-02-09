// src/components/SelectWorkoutOverlay.jsx
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

export default function SelectWorkoutOverlay({ open, onOpenChange, dateISO, userId, onStart }) {
  const [workouts, setWorkouts] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("workouts")
        .select("id, name")
        .eq("owner_id", userId)
        .order("name", { ascending: true });
      if (!error) setWorkouts(data || []);
      setLoading(false);
    })();
  }, [open, userId]);

  useEffect(() => {
    if (!selectedId) { setPreview(null); return; }
    (async () => {
      const { data, error } = await supabase
        .from("workout_exercises")
        .select("id, exercise_id, plan_set_count, set_targets, exercises_catalog(name, equipment, muscle_group, youtube_url)")
        .eq("workout_id", selectedId)
        .order("id", { ascending: true });
      if (!error) {
        setPreview({
          exercises: (data || []).map(row => ({
            id: row.id,
            name: row.exercises_catalog?.name || "Exercise",
            equipment: row.exercises_catalog?.equipment || "Unknown",
            muscle_group: row.exercises_catalog?.muscle_group || null,
            youtube_url: row.exercises_catalog?.youtube_url || null,
            set_targets: row.set_targets || [],
            plan_set_count: row.plan_set_count || null,
          }))
        });
      }
    })();
  }, [selectedId]);

  const handleStart = () => {
    if (!selectedId) return;
    onStart?.({ dateISO, workoutId: selectedId, preview });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Select Workout Type</DialogTitle>
          <DialogDescription>Choose a workout for {dateISO} and review the exercises before starting.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid gap-2">
            <label className="text-sm font-medium">Workout</label>
            <Select value={selectedId} onValueChange={setSelectedId} disabled={loading || workouts.length===0}>
              <SelectTrigger>
                <SelectValue placeholder={loading ? "Loading…" : "Choose a workout…"} />
              </SelectTrigger>
              <SelectContent>
                {workouts.map(w => (
                  <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {preview && (
            <ScrollArea className="h-72 rounded-md border p-2">
              <div className="space-y-2">
                {preview.exercises.map(ex => (
                  <Card key={ex.id} className="p-3">
                    <div className="flex items-center gap-2">
                      <div className="font-medium">{ex.name}</div>
                      {ex.equipment && <Badge variant="secondary">{ex.equipment}</Badge>}
                      {ex.muscle_group && <span className="text-xs text-muted-foreground">• {ex.muscle_group}</span>}
                    </div>
                    {ex.set_targets?.length ? (
                      <ul className="mt-2 text-sm list-disc pl-5">
                        {ex.set_targets
                          .sort((a,b)=>(a.set_index??0)-(b.set_index??0))
                          .map((s,i)=>(
                            <li key={i}>Set {s.set_index ?? i+1} – {s.reps ?? "?"} reps @ {s.weight ?? "?"}</li>
                        ))}
                      </ul>
                    ) : (
                      <div className="mt-2 text-sm text-muted-foreground">No per-set targets</div>
                    )}
                  </Card>
                ))}
              </div>
            </ScrollArea>
          )}

          <Button className="w-full" onClick={handleStart} disabled={!selectedId}>Start Workout</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
