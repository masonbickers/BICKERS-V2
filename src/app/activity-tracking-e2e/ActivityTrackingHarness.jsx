"use client";

import UserActivityPanel from "@/app/admin/_components/UserActivityPanel";

export default function ActivityTrackingHarness() {
  return <UserActivityPanel getAuthToken={async () => "browser-test-token"} />;
}
