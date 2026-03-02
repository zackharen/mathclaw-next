import { redirect } from "next/navigation";

export default async function ClassCalendarPage({ params }) {
  const { id } = await params;
  redirect(`/classes/${id}/plan`);
}
