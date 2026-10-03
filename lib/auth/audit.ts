import { db } from "@/lib/db";

export async function writeAdminAudit(
  adminId: string,
  action: string,
  target: string,
) {
  return db.adminAction.create({
    data: {
      adminId,
      action,
      target,
    },
  });
}
