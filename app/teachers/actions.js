"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

async function getAuthedUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function sendTeacherRequestAction(formData) {
  const targetId = formData.get("target_id");
  if (typeof targetId !== "string" || !targetId) return;

  const { supabase, user } = await getAuthedUser();
  if (!user) redirect("/auth/sign-in?redirect=/teachers");
  if (user.id === targetId) return;

  const { data: existing } = await supabase
    .from("teacher_connections")
    .select("id, requester_id, addressee_id, status")
    .or(
      `and(requester_id.eq.${user.id},addressee_id.eq.${targetId}),and(requester_id.eq.${targetId},addressee_id.eq.${user.id})`
    )
    .limit(1)
    .maybeSingle();

  if (!existing) {
    const { error } = await supabase.from("teacher_connections").insert({
      requester_id: user.id,
      addressee_id: targetId,
      status: "pending",
    });
    if (error) throw new Error(error.message);
  } else if (
    existing.requester_id === targetId &&
    existing.addressee_id === user.id &&
    existing.status === "pending"
  ) {
    const { error } = await supabase
      .from("teacher_connections")
      .update({ status: "accepted" })
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
  }

  revalidatePath("/teachers");
  redirect(`/teachers?updated=1&t=${Date.now()}`);
}

export async function acceptTeacherRequestAction(formData) {
  const connectionId = formData.get("connection_id");
  if (typeof connectionId !== "string" || !connectionId) return;

  const { supabase, user } = await getAuthedUser();
  if (!user) redirect("/auth/sign-in?redirect=/teachers");

  const { error } = await supabase
    .from("teacher_connections")
    .update({ status: "accepted" })
    .eq("id", connectionId)
    .eq("addressee_id", user.id)
    .eq("status", "pending");
  if (error) throw new Error(error.message);

  revalidatePath("/teachers");
  redirect(`/teachers?updated=1&t=${Date.now()}`);
}

export async function declineTeacherRequestAction(formData) {
  const connectionId = formData.get("connection_id");
  if (typeof connectionId !== "string" || !connectionId) return;

  const { supabase, user } = await getAuthedUser();
  if (!user) redirect("/auth/sign-in?redirect=/teachers");

  const { error } = await supabase
    .from("teacher_connections")
    .delete()
    .eq("id", connectionId)
    .or(`addressee_id.eq.${user.id},requester_id.eq.${user.id}`)
    .eq("status", "pending");
  if (error) throw new Error(error.message);

  revalidatePath("/teachers");
  redirect(`/teachers?updated=1&t=${Date.now()}`);
}
