import { labelCspDomainAction } from "@/app/admin/hosts/actions";

import styles from "./NewPlayerDomainsAlert.module.css";

export type HostOption = { id: string; label: string };

/** "Quảng cáo — bỏ qua" and "Là player của host" for one reported domain. */
export function DomainLabelButtons({ domain, hosts }: { domain: string; hosts: HostOption[] }) {
  return (
    <span className={styles.actions}>
      <form action={labelCspDomainAction}>
        <input type="hidden" name="domain" value={domain} />
        <input type="hidden" name="kind" value="ad" />
        <button type="submit" className={styles.button}>
          Quảng cáo — bỏ qua
        </button>
      </form>
      {hosts.length ? (
        <form action={labelCspDomainAction}>
          <input type="hidden" name="domain" value={domain} />
          <input type="hidden" name="kind" value="player" />
          <select name="hostId" aria-label={`Host của ${domain}`} defaultValue={hosts[0].id} className={styles.select}>
            {hosts.map((host) => (
              <option key={host.id} value={host.id}>
                {host.label}
              </option>
            ))}
          </select>
          <button type="submit" className={styles.button}>
            Là player của host
          </button>
        </form>
      ) : null}
    </span>
  );
}
