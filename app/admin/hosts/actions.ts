"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { writeAdminAudit } from "@/lib/auth/audit";
import { requireAdmin } from "@/lib/auth/session";
import { db } from "@/lib/db";

const hostFormSchema = z.object({
  primaryHostId: z.string().min(1),
  order: z.array(z.string().min(1)).min(1),
  enabledHostIds: z.array(z.string()),
});

export type HostsState = {
  error?: string;
  success?: string;
};

export async function saveHostsAction(
  _previousState: HostsState,
  formData: FormData,
): Promise<HostsState> {
  const admin = await requireAdmin();

  let order: unknown;
  try {
    order = JSON.parse(String(formData.get("order") ?? "[]"));
  } catch {
    return { error: "Server order is invalid." };
  }

  const parsed = hostFormSchema.safeParse({
    primaryHostId: formData.get("primaryHostId"),
    order,
    enabledHostIds: formData.getAll("enabledHostId"),
  });

  if (!parsed.success) {
    return { error: "Check the host configuration and try again." };
  }

  const hosts = await db.host.findMany({
    select: { id: true, isPrimary: true },
  });
  const knownIds = new Set(hosts.map((host) => host.id));

  if (
    parsed.data.order.length !== hosts.length ||
    new Set(parsed.data.order).size !== hosts.length ||
    parsed.data.order.some((id) => !knownIds.has(id)) ||
    !knownIds.has(parsed.data.primaryHostId)
  ) {
    return { error: "Host configuration is out of date. Reload and try again." };
  }

  const enabled = new Set(parsed.data.enabledHostIds);
  enabled.add(parsed.data.primaryHostId);
  const oldPrimary = hosts.find((host) => host.isPrimary)?.id ?? null;

  await db.$transaction(
    parsed.data.order.map((id, index) =>
      db.host.update({
        where: { id },
        data: {
          enabled: enabled.has(id),
          isPrimary: id === parsed.data.primaryHostId,
          sortOrder: (index + 1) * 10,
        },
      }),
    ),
  );

  await writeAdminAudit(
    admin.id,
    oldPrimary === parsed.data.primaryHostId
      ? "HOSTS_UPDATE"
      : "PRIMARY_HOST_CHANGE",
    `primary=${parsed.data.primaryHostId};order=${parsed.data.order.join(",")}`,
  );

  revalidatePath("/admin");
  revalidatePath("/admin/hosts");
  return { success: "Hosts saved." };
}
