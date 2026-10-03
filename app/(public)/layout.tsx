import { cookies } from "next/headers";
import type { ReactNode } from "react";

import { AgeGate } from "@/components/shell/AgeGate";
import { BottomNav } from "@/components/shell/BottomNav";
import { Footer } from "@/components/shell/Footer";
import { Header } from "@/components/shell/Header";
import { MobileHeader } from "@/components/shell/MobileHeader";
import { db } from "@/lib/db";
import { AGE_GATE_COOKIE_NAME, getAgeGateCookieLifetimeDays } from "@/lib/settings/ageGate";

export default async function PublicLayout({ children }: Readonly<{ children: ReactNode }>) {
  const cookieStore = await cookies();
  const acknowledged = cookieStore.get(AGE_GATE_COOKIE_NAME)?.value === "1";

  const [cookieLifetimeDays, show2257Setting] = await Promise.all([
    acknowledged ? Promise.resolve(null) : getAgeGateCookieLifetimeDays(),
    db.setting.findUnique({
      where: { key: "show2257" },
      select: { value: true },
    }),
  ]);
  const show2257 =
    typeof show2257Setting?.value === "boolean"
      ? show2257Setting.value
      : false;

  return (
    <>
      <Header />
      <MobileHeader />
      <main>{children}</main>
      <Footer show2257={show2257} />
      <BottomNav />
      {!acknowledged ? <AgeGate cookieName={AGE_GATE_COOKIE_NAME} cookieLifetimeDays={cookieLifetimeDays} /> : null}
    </>
  );
}
