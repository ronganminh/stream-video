import { requireAdmin } from "@/lib/auth/session";
import { db } from "@/lib/db";
import {
  DEFAULT_SYNC_SETTINGS,
  getSyncSettings,
} from "@/lib/sync/settings";
import {
  getAgeGateCookieLifetimeDays,
} from "@/lib/settings/ageGate";

import {
  changePasswordAction,
  updateSettingsAction,
} from "./actions";
import styles from "./page.module.css";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireAdmin();

  const [sync, ageGateCookieLifetimeDays, show2257Setting, params] =
    await Promise.all([
      getSyncSettings().catch(() => DEFAULT_SYNC_SETTINGS),
      getAgeGateCookieLifetimeDays(),
      db.setting.findUnique({
        where: { key: "show2257" },
        select: { value: true },
      }),
      searchParams,
    ]);

  const show2257 =
    typeof show2257Setting?.value === "boolean"
      ? show2257Setting.value
      : false;
  const saved = typeof params.saved === "string" ? params.saved : null;
  const error = typeof params.error === "string" ? params.error : null;

  return (
    <main className={styles.page}>
      <p className={styles.eyebrow}>CONFIGURATION</p>
      <h1>Settings</h1>
      <p className={styles.intro}>
        Runtime settings are stored in the database and read by the worker
        and public shell without a source-code change.
      </p>

      {saved ? (
        <p className={styles.success} role="status">
          {saved === "password" ? "Password updated." : "Settings saved."}
        </p>
      ) : null}
      {error ? (
        <p className={styles.error} role="alert">
          {error === "current-password"
            ? "Current password is incorrect."
            : error === "password"
              ? "Use a new password of at least 12 characters and confirm it."
              : "Check the settings values and try again."}
        </p>
      ) : null}

      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <h2>Sync</h2>
          <span>Worker configuration</span>
        </div>
        <form className={styles.form} action={updateSettingsAction}>
          <div className={styles.twoColumns}>
            <label className={styles.field}>
              <span>New video interval (minutes)</span>
              <input
                name="syncNewIntervalMinutes"
                type="number"
                min="1"
                max="1440"
                defaultValue={sync.newIntervalMinutes}
                required
              />
            </label>
            <label className={styles.field}>
              <span>Health interval (hours)</span>
              <input
                name="syncHealthIntervalHours"
                type="number"
                min="1"
                max="720"
                defaultValue={sync.healthIntervalHours}
                required
              />
            </label>
          </div>

          <label className={styles.toggle}>
            <input
              name="syncAutoMatchEnabled"
              type="checkbox"
              defaultChecked={sync.autoMatchEnabled}
            />
            <span>
              <strong>Automatic mirror matching</strong>
              <small>
                Link a secondary-host file only when its normalized filename
                has one unambiguous match.
              </small>
            </span>
          </label>

          <label className={styles.field}>
            <span>Age-gate cookie lifetime (days)</span>
            <input
              name="ageGateCookieLifetimeDays"
              type="number"
              min="1"
              max="3650"
              defaultValue={ageGateCookieLifetimeDays ?? ""}
              placeholder="Session only"
            />
            <small>
              Leave blank to keep acknowledgement for the current browser
              session only.
            </small>
          </label>

          <label className={styles.toggle}>
            <input
              name="show2257"
              type="checkbox"
              defaultChecked={show2257}
            />
            <span>
              <strong>Show 2257 footer link</strong>
              <small>
                Controls only whether the link is visible in the public footer.
              </small>
            </span>
          </label>

          <div className={styles.actions}>
            <button type="submit">Save settings</button>
          </div>
        </form>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <h2>Change password</h2>
          <span>Current administrator</span>
        </div>
        <form className={styles.form} action={changePasswordAction}>
          <label className={styles.field}>
            <span>Current password</span>
            <input
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          <label className={styles.field}>
            <span>New password</span>
            <input
              name="newPassword"
              type="password"
              minLength={12}
              autoComplete="new-password"
              required
            />
          </label>
          <label className={styles.field}>
            <span>Confirm new password</span>
            <input
              name="confirmPassword"
              type="password"
              minLength={12}
              autoComplete="new-password"
              required
            />
          </label>
          <div className={styles.actions}>
            <button type="submit">Update password</button>
          </div>
        </form>
      </section>
    </main>
  );
}
