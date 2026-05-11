import { sendLectureAccessEmail } from "@/src/server/email/mailer";
import { supabaseAdmin } from "@/src/server/db/supabaseAdmin";
import { getDriveClient } from "@/src/server/drive/googleDrive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getEnv(name: string): string | undefined {
  const v = process.env[name];
  if (!v) return undefined;
  const trimmed = v.trim();
  return trimmed.length ? trimmed : undefined;
}

async function checkSupabaseTable(table: string) {
  const result = await supabaseAdmin.from(table).select("id").limit(1);
  if (!result.error) {
    return { ok: true, rowCount: result.data?.length ?? 0 };
  }

  const message = result.error.message || "Unknown Supabase error";
  const isMissingRelation =
    /relation .* does not exist|does not exist/i.test(message) ||
    /UndefinedTable|42P01/i.test(message) ||
    /Could not find the table/i.test(message);

  return {
    ok: false,
    missingTable: isMissingRelation,
    message,
  };
}

export async function GET() {
  const appUrl = getEnv("APP_URL") ?? "http://localhost:3000";

  // We intentionally do not return secrets (only error messages if something fails).
  const [supabaseLectures, supabaseLectureAccess] = await Promise.all([
    checkSupabaseTable("lectures").catch((e) => ({
      ok: false,
      message: e instanceof Error ? e.message : String(e),
      missingTable: false,
    })),
    checkSupabaseTable("lecture_access").catch((e) => ({
      ok: false,
      message: e instanceof Error ? e.message : String(e),
      missingTable: false,
    })),
  ]);

  const supabaseTables = {
    lectures: supabaseLectures,
    lecture_access: supabaseLectureAccess,
  };

  const supabaseReachable =
    supabaseLectures.ok ||
    supabaseLectureAccess.ok ||
    (supabaseLectures.missingTable && supabaseLectureAccess.missingTable);

  const driveFolderId = getEnv("GOOGLE_DRIVE_FOLDER_ID");

  let drive: any = { ok: false };
  if (!driveFolderId) {
    drive = { ok: false, error: "Missing GOOGLE_DRIVE_FOLDER_ID" };
  } else {
    try {
      const driveClient = await getDriveClient();
      const folder = await driveClient.files.get({
        fileId: driveFolderId,
        fields: "id,name",
      });
      drive = {
        ok: true,
        folder: { id: folder.data.id, name: folder.data.name },
      };
    } catch (e) {
      drive = {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  const resendTestTo = getEnv("RESEND_TEST_TO");
  let email: any = { status: "skipped", reason: "RESEND_TEST_TO not set" };
  if (resendTestTo) {
    try {
      const res = await sendLectureAccessEmail({
        to: resendTestTo,
        lectureTitle: "Infra test lecture",
        watchUrl: `${appUrl}/watch/infra-test`,
      });
      email = { status: "sent", messageId: res.messageId ?? null };
    } catch (e) {
      email = {
        status: "failed",
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  const ok = supabaseReachable && drive.ok && (email.status === "skipped" || email.status === "sent");

  return Response.json({
    ok,
    supabase: { reachable: supabaseReachable, tables: supabaseTables },
    drive,
    email,
  });
}

