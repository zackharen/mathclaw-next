import RouteSkeleton from "@/app/components/RouteSkeleton";

export default function Loading() {
  return <RouteSkeleton hero stats={4} cards={4} columns={2} label="Loading your classes…" />;
}
