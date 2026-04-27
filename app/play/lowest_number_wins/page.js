import { redirect } from "next/navigation";

export default async function LowestNumberWinsLegacyPage({ searchParams }) {
  const params = (await searchParams) || {};
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      value.forEach((entry) => query.append(key, entry));
    } else if (typeof value === "string") {
      query.set(key, value);
    }
  }

  const suffix = query.toString() ? `?${query.toString()}` : "";
  redirect(`/play/lowest-number-wins${suffix}`);
}
