import { NextResponse } from "next/server";
import { createClient } from "app/lib/supabase/server";

type OtpType = "signup" | "recovery" | "email_change" | "invite" | "magiclink";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as OtpType | null;
  const next = searchParams.get("next");

  if (token_hash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ token_hash, type });
    if (!error) {
      const defaultRedirect =
        type === "recovery" ? "/reset-password" :
        type === "email_change" ? "/settings?email_updated=1" :
        "/community";
      return NextResponse.redirect(`${origin}${next || defaultRedirect}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=invalid_link`);
}
