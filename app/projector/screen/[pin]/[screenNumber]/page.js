import { createAdminClient } from "@/lib/supabase/admin";
import ScreenClient from "../../screen-client";

export const dynamic = "force-dynamic";

const SCREEN_IDS = ["1", "2", "3", "4"];

export default async function ProjectorScreenPinPage({ params }) {
  const { pin, screenNumber } = await params;
  const safePin = String(pin || "").trim();
  const safeScreen = String(screenNumber || "").trim();

  let initialToken = null;

  if (/^\d{6}$/.test(safePin) && SCREEN_IDS.includes(safeScreen)) {
    try {
      const admin = createAdminClient();
      const { data: session } = await admin
        .from("projector_sessions")
        .select("screen_tokens")
        .eq("pin", safePin)
        .maybeSingle();
      initialToken = session?.screen_tokens?.[safeScreen] || null;
    } catch {
      // fall through — client will show the connect form
    }
  }

  return <ScreenClient initialToken={initialToken} />;
}
