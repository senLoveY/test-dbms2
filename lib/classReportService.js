import { buildClassReport, summarizeClassReport } from "./classReport.js";
import { daysAgo, RETENTION } from "./privacy.js";
import { getSupabaseAdmin } from "./supabaseAdmin.js";

const COLUMNS = "id, room_id, quiz_id, quiz_title, question_total, questions, players, created_at";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UNDEFINED_TABLE = "42P01";
const TABLE_NOT_FOUND = "PGRST205";

function missingTable(error) {
  return error?.code === UNDEFINED_TABLE || error?.code === TABLE_NOT_FOUND;
}

/** Reports hold students' names: they go after RETENTION.classReportDays. */
async function purgeOldReports(hostId) {
  const { error } = await getSupabaseAdmin()
    .from("class_reports")
    .delete()
    .eq("host_id", hostId)
    .lt("created_at", daysAgo(RETENTION.classReportDays));
  if (error && !missingTable(error)) console.warn("Could not purge old class reports:", error.message);
}

export async function listClassReports(hostId) {
  await purgeOldReports(hostId);
  const { data, error } = await getSupabaseAdmin()
    .from("class_reports")
    .select(COLUMNS)
    .eq("host_id", hostId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (missingTable(error)) return { reports: [] };
  if (error) throw error;
  return { reports: (data || []).map(summarizeClassReport) };
}

/** By report id, or by the room id the lesson screen knows. */
export async function getClassReport(id, hostId) {
  if (!UUID.test(String(id || ""))) return { error: "Отчёт не найден" };
  const { data, error } = await getSupabaseAdmin()
    .from("class_reports")
    .select(COLUMNS)
    .eq("host_id", hostId)
    .or(`id.eq.${id},room_id.eq.${id}`)
    .maybeSingle();
  if (missingTable(error)) return { error: "Отчёты ещё не включены: выполните class-reports-migration.sql" };
  if (error) throw error;
  if (!data) return { error: "Отчёт не найден" };
  return { report: buildClassReport(data) };
}

export async function deleteClassReport(id, hostId) {
  if (!UUID.test(String(id || ""))) return { error: "Отчёт не найден" };
  const { data, error } = await getSupabaseAdmin()
    .from("class_reports")
    .delete()
    .eq("id", id)
    .eq("host_id", hostId)
    .select("id");
  if (error) throw error;
  if (!data?.length) return { error: "Отчёт не найден" };
  return { ok: true };
}
