import Link from "next/link";

import { acknowledgePlayerDomainsAction } from "@/app/admin/hosts/actions";
import type { NewPlayerDomain } from "@/lib/security/cspReports";

import styles from "./NewPlayerDomainsAlert.module.css";

/**
 * Red alert while a player domain nobody has seen yet was reported by
 * browsers (CSP report-only list). A host may have moved its player; check
 * that videos still play and add the domain to the host's embedDomains.
 */
export function NewPlayerDomainsAlert({ domains, showLink = false }: { domains: NewPlayerDomain[]; showLink?: boolean }) {
  if (!domains.length) return null;
  return (
    <section className={styles.alert} role="alert" aria-labelledby="new-player-domains">
      <div className={styles.text}>
        <h2 id="new-player-domains">
          <span className={styles.dot} aria-hidden="true" />
          {domains.length === 1 ? "Domain player mới" : `${domains.length} domain player mới`}
        </h2>
        <p>
          Trình duyệt báo khung player từ domain chưa từng thấy (có thể host đã đổi domain). Video vẫn phát;
          kiểm tra lại rồi thêm domain vào danh sách của host nếu đúng.
        </p>
        <ul>
          {domains.slice(0, 8).map((domain) => (
            <li key={domain.host}>
              <code>{domain.host}</code> <span>· lần đầu {domain.firstSeenAt.slice(0, 16).replace("T", " ")} UTC</span>
            </li>
          ))}
        </ul>
        {showLink ? <Link href="/admin/hosts">Xem chi tiết ở Hosts</Link> : null}
      </div>
      <form action={acknowledgePlayerDomainsAction}>
        <button type="submit" className={styles.ack}>
          Đã xem
        </button>
      </form>
    </section>
  );
}
