import { redirect } from "next/navigation";

import { getCurrentAdmin } from "@/lib/auth/session";

import { LoginForm } from "./LoginForm";
import styles from "./page.module.css";

export default async function AdminLoginPage() {
  const admin = await getCurrentAdmin();
  if (admin) redirect("/admin");

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <div className={styles.brand}>GayVideo.fun</div>
        <p className={styles.eyebrow}>ADMIN</p>
        <h1>Sign in</h1>
        <p className={styles.intro}>
          Use your administrator account to continue.
        </p>
        <LoginForm />
      </section>
    </main>
  );
}
