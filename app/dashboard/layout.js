import DashboardAssignmentInjector from "./announcement-assignments-injector";

export default function DashboardLayout({ children }) {
  return (
    <>
      <DashboardAssignmentInjector />
      {children}
    </>
  );
}
