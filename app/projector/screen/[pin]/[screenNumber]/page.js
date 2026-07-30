import { createAdminClient } from "@/lib/supabase/admin";
import ScreenClient from "../../screen-client";

export const dynamic = "force-dynamic";

const SCREEN_IDS = Array.from({ length: 12 }, (_, index) => String(index + 1));

export default async function ProjectorScreenPinPage({ params }) {
  const { pin, screenNumber } = await params;
  const safePin = String(pin || "").trim();
  const safeScreen = String(screenNumber || "").trim();

  let initialToken = null;
  const addressed = /^\d{6}$/.test(safePin) && SCREEN_IDS.includes(safeScreen);

  if (addressed) {
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

  // A screen added to a Room after its session was created has no token yet;
  // tokens are minted lazily by the rooms API, not by saving the Room. Handing
  // the client the address it was opened with lets it resolve one instead of
  // dropping the teacher on a blank PIN form the copied URL was meant to skip.
  return <ScreenClient initialToken={initialToken} initialPin={addressed ? safePin : ""} initialScreenNumber={addressed ? safeScreen : ""} />;
}
