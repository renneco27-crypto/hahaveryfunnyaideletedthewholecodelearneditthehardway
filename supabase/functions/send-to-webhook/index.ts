import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const WEBHOOK_URL = Deno.env.get("WEBHOOK_URL")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  const payload = await req.json();
  const record = payload.record;

  if (record.status !== "pending") {
    return new Response("skipped", { status: 200 });
  }

  const delay = Math.floor(Math.random() * 30 + 1) * 1000;
  await new Promise((r) => setTimeout(r, delay));

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: record.id,
        reference_number: record.reference_number,
        submitted_at: record.submitted_at,
        school_name: record.school_name,
        division: record.division,
        module: record.module,
        category: record.category,
        report_data: record.report_data,
        prepared_by: record.prepared_by,
        validated_by: record.validated_by,
      }),
    });

    if (!res.ok) throw new Error(`Webhook returned ${res.status}`);

    await supabase
      .from("bullying_reports")
      .update({ status: "sent", webhook_sent_at: new Date().toISOString() })
      .eq("id", record.id);

    return new Response("sent", { status: 200 });
  } catch (err) {
    await supabase
      .from("bullying_reports")
      .update({ status: "failed" })
      .eq("id", record.id);

    return new Response(err.message, { status: 500 });
  }
});