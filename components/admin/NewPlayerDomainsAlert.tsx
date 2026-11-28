import Link from "next/link";

import { acknowledgePlayerDomainsAction } from "@/app/admin/hosts/actions";
import type { NewPlayerDomain } from "@/lib/security/cspReports";

import { DomainLabelButtons, type HostOption } from "./DomainLabelButtons";
import styles from "./NewPlayerDomainsAlert.module.css";

const when = (domain: NewPlayerDomain) => domain.firstSeenAt.slice(0, 16).replace("T", " ");

/**
 * Frame domains browsers reported outside the known player list. Not an app
 * error: mostly ad pages the host's player opens on a click. Red only for
 * domains with no ad signs and no admin label; clear ad look-alikes are
 * listed apart, in a neutral box. Each domain can be marked as an ad (never
 * shown again) or as a host's player.
 */
export function NewPlayerDomainsAlert({
  domains,
  likelyAds = [],
  hosts = [],
  showLink = false,
}: {
  domains: NewPlayerDomain[];
  likelyAds?: NewPlayerDomain[];
  hosts?: HostOption[];
  showLink?: boolean;
}) {
  if (!domains.length && !likelyAds.length) return null;
  return (
    <>
      {domains.length ? (
        <section className={styles.alert} role="alert" aria-labelledby="new-player-domains">
          <div className={styles.text}>
            <h2 id="new-player-domains">
              <span className={styles.dot} aria-hidden="true" />
              {domains.length === 1 ? "1 domain lạ trong khung player" : `${domains.length} domain lạ trong khung player`}
            </h2>
            <p>
              Không phải lỗi của trang. Trình duyệt người xem báo khung player đã mở một domain ngoài danh sách đã
              biết: thường là trang quảng cáo host mở khi người xem bấm, đôi khi host đổi domain player. Video vẫn
              phát. Chọn cho từng domain:
            </p>
            <ul className={styles.list}>
              {domains.slice(0, 10).map((domain) => (
                <li key={domain.host}>
                  <span>
                    <code>{domain.host}</code> <span className={styles.meta}>· lần đầu {when(domain)} UTC</span>
                  </span>
                  <DomainLabelButtons domain={domain.host} hosts={hosts} />
                </li>
              ))}
            </ul>
            {showLink ? <Link href="/admin/hosts">Xem chi tiết ở Hosts</Link> : null}
          </div>
          <form action={acknowledgePlayerDomainsAction}>
            <button type="submit" className={styles.ack}>
              Đã xem tất cả
            </button>
          </form>
        </section>
      ) : null}
      {likelyAds.length ? (
        <section className={styles.neutral} aria-labelledby="likely-ad-domains">
          <div className={styles.text}>
            <h2 id="likely-ad-domains">Có thể là quảng cáo ({likelyAds.length})</h2>
            <p>
              Domain có dấu hiệu quảng cáo/cờ bạc mà player của host mở khi người xem bấm. Không phải lỗi, không
              cần làm gì; bấm &quot;Quảng cáo — bỏ qua&quot; để ẩn hẳn.
            </p>
            <ul className={styles.list}>
              {likelyAds.slice(0, 10).map((domain) => (
                <li key={domain.host}>
                  <span>
                    <code>{domain.host}</code> <span className={styles.meta}>· {when(domain)} UTC</span>
                  </span>
                  <DomainLabelButtons domain={domain.host} hosts={hosts} />
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}
    </>
  );
}
