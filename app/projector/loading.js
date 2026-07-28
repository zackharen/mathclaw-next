import RouteSkeleton from "@/app/components/RouteSkeleton";

export default function Loading() {
  return (
    <RouteSkeleton
      hero
      stats={3}
      cards={4}
      columns={2}
      tone="dark"
      label="Loading Projector Studio…"
    />
  );
}
