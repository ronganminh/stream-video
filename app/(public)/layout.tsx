import type { ReactNode } from "react";

import { BottomNav } from "@/components/shell/BottomNav";
import { Footer } from "@/components/shell/Footer";
import { Header } from "@/components/shell/Header";
import { MobileHeader } from "@/components/shell/MobileHeader";

export default function PublicLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <>
      <Header />
      <MobileHeader />
      <main>{children}</main>
      <Footer />
      <BottomNav />
    </>
  );
}
