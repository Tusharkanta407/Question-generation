import { supabaseAdmin } from "@/src/server/db/supabaseAdmin";

/**
 * Upsert teacher by email. Refresh token is only updated when `refreshToken` is non-null.
 */
export async function persistGoogleCredentialsForTeacher(
  email: string,
  name: string | null,
  refreshToken: string | null
) {
  const normalized = email.trim().toLowerCase();

  const { data: existing } = await supabaseAdmin
    .from("teachers")
    .select("id")
    .eq("email", normalized)
    .maybeSingle();

  if (existing?.id) {
    const patch: { name?: string | null; google_refresh_token?: string } = {};
    if (name !== undefined) patch.name = name;
    if (refreshToken) patch.google_refresh_token = refreshToken;
    if (Object.keys(patch).length > 0) {
      const { error } = await supabaseAdmin
        .from("teachers")
        .update(patch)
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
    }
    return existing.id as string;
  }

  const { data: created, error } = await supabaseAdmin
    .from("teachers")
    .insert({
      email: normalized,
      name: name ?? null,
      google_refresh_token: refreshToken,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  return created!.id as string;
}
