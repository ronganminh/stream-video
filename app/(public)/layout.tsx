import type { ReactNode } from "react";

import { AgeGate } from "@/components/shell/AgeGate";
import { BottomNav } from "@/components/shell/BottomNav";
import { Footer } from "@/components/shell/Footer";
import { Header, PublicContent } from "@/components/shell/Header";
import { MobileHeader } from "@/components/shell/MobileHeader";
import { db } from "@/lib/db";
import { AGE_GATE_COOKIE_NAME, getAgeGateCookieLifetimeDays } from "@/lib/settings/ageGate";

// Public pages are cached and shared by every visitor, so nothing here may
// depend on the request: the age gate decides on the client (lib/ageGate).
export default async function PublicLayout({ children }: Readonly<{ children: ReactNode }>) {
  const [cookieLifetimeDays, show2257Setting] = await Promise.all([
    getAgeGateCookieLifetimeDays(),
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
      <PublicContent>{children}</PublicContent>
      <Footer show2257={show2257} />
      <BottomNav />
      <AgeGate cookieName={AGE_GATE_COOKIE_NAME} cookieLifetimeDays={cookieLifetimeDays} />
    </>
  );
}
