import { cookies } from "next/headers";
import type { ReactNode } from "react";

import { AgeGate } from "@/components/shell/AgeGate";
import { BottomNav } from "@/components/shell/BottomNav";
import { Footer } from "@/components/shell/Footer";
import { Header } from "@/components/shell/Header";
import { MobileHeader } from "@/components/shell/MobileHeader";
import { AGE_GATE_COOKIE_NAME, getAgeGateCookieLifetimeDays } from "@/lib/settings/ageGate";

export default async function PublicLayout({ children }: Readonly<{ children: ReactNode }>) {
  const cookieStore = await cookies();
  const acknowledged = cookieStore.get(AGE_GATE_COOKIE_NAME)?.value === "1";
  const cookieLifetimeDays = acknowledged ? null : await getAgeGateCookieLifetimeDays();

  return (
    <>
      <Header />
      <MobileHeader />
      <main>{children}</main>
      <Footer />
      <BottomNav />
      {!acknowledged ? <AgeGate cookieName={AGE_GATE_COOKIE_NAME} cookieLifetimeDays={cookieLifetimeDays} /> : null}
    </>
  );
}
