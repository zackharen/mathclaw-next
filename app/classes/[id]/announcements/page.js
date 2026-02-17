import { redirect } from "next/navigation";

export default async function ClassAnnouncementsPage({ params }) {
  const { id } = await params;
  redirect(`/classes/${id}/plan`);
}
