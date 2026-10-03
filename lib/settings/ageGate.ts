import { db } from "@/lib/db";

export const AGE_GATE_SETTING_KEY = "ageGateCookieLifetimeDays";
export const AGE_GATE_COOKIE_NAME = "gv_age_ack";

export function parseAgeGateCookieLifetimeDays(
  value: unknown,
): number | null {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value <= 0
  ) {
    return null;
  }

  return value;
}

export async function getAgeGateCookieLifetimeDays() {
  const setting = await db.setting.findUnique({
    where: { key: AGE_GATE_SETTING_KEY },
    select: { value: true },
  });

  return parseAgeGateCookieLifetimeDays(setting?.value);
}
