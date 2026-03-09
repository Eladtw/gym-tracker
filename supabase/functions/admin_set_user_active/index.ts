import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Body = { user_id?: string; is_active?: boolean };

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return new Response(JSON.stringify({ error: "Missing token" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user) return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const callerId = userData.user.id;

    const { data: callerProfile } = await admin.from("profiles").select("role").eq("id", callerId).single();
    if (!callerProfile || callerProfile.role !== "admin") return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const body = (await req.json()) as Body;
    const targetId = body.user_id;
    const isActive = body.is_active;

    if (!targetId || typeof isActive !== "boolean") {
      return new Response(JSON.stringify({ error: "Missing user_id / is_active" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Ban/unban via Auth Admin API
    const ban_duration = isActive ? "none" : "876000h"; // 100 years
    const { error: upAuthErr } = await admin.auth.admin.updateUserById(targetId, { ban_duration });
    if (upAuthErr) return new Response(JSON.stringify({ error: upAuthErr.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Update profiles flag
    const { error: upDbErr } = await admin.from("profiles").update({ is_active: isActive }).eq("id", targetId);
    if (upDbErr) return new Response(JSON.stringify({ error: upDbErr.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    return new Response(JSON.stringify({ ok: true, user_id: targetId, is_active: isActive }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
