import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAccountTypeForUser } from "@/lib/auth/account-type";
import OpenMiddleSessionClient from "./game-client";

export default async function OpenMiddleSessionPage({ params }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/sign-in?redirect=/play/open-middle");

  const viewerAccountType = await getAccountTypeForUser(supabase, user);
  const { sessionId } = await params;

  return (
    <div className="stack">
      <OpenMiddleSessionClient
        sessionId={sessionId}
        userId={user.id}
        viewerAccountType={viewerAccountType}
      />
    </div>
  );
}
