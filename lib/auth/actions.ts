"use server";

import { redirect } from "next/navigation";

import { clearAdminSession, getCurrentAdmin } from "./session";
import { writeAdminAudit } from "./audit";

export async function logoutAction(): Promise<void> {
  const admin = await getCurrentAdmin();

  if (admin) {
    await writeAdminAudit(admin.id, "LOGOUT", "admin-session");
  }

  await clearAdminSession();
  redirect("/admin/login");
}
