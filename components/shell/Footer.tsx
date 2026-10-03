import Link from "next/link";

import styles from "./Footer.module.css";

export type FooterProps = {
  show2257?: boolean;
  section2257Href?: string;
};

function FooterMark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="var(--gv-text)" />
      <path d="M22.6 10.2A8.6 8.6 0 1 0 24.6 16.5H20" fill="none" stroke="var(--gv-bg)" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13.2 12.6v7.2l5.6-3.6z" fill="var(--gv-bg)" />
    </svg>
  );
}

function FooterBrand({ mobile = false }: { mobile?: boolean }) {
  return <span className={styles.brand} data-mobile={mobile || undefined}><FooterMark size={mobile ? 22 : 24} /><span>GayVideo.fun</span></span>;
}

export function Footer({ show2257 = false, section2257Href = "/2257" }: FooterProps) {
  const year = new Date().getUTCFullYear();

  return (
    <footer className={styles.footer}>
      <div className={`gv-container ${styles.desktop}`}>
        <div className={styles.intro}>
          <FooterBrand />
          <p>Gay video discovery and streaming. Adults only.</p>
          <span className={styles.adults}>18+ ONLY</span>
        </div>
        <div className={styles.column}>
          <span className={styles.heading}>Platform</span><span>About</span><span>Contact</span><Link href="/categories">Categories</Link>
        </div>
        <div className={styles.column}>
          <span className={styles.heading}>Safety</span><span>Report Content</span><Link href="/content-removal">Content Removal</Link><Link href="/content-removal/dmca">DMCA</Link>{show2257 ? <Link href={section2257Href}>2257</Link> : null}
        </div>
        <div className={styles.column}>
          <span className={styles.heading}>Legal</span><Link href="/terms">Terms</Link><Link href="/privacy">Privacy</Link><Link href="/cookies">Cookies</Link><span>Privacy settings</span>
        </div>
        <div className={styles.copyright}>© {year} GayVideo.fun</div>
      </div>

      <div className={styles.mobile}>
        <div className={styles.mobileTop}><FooterBrand mobile /><span className={styles.mobileAdults}>18+ ONLY</span></div>
        <p>Adults only. Report content or request removal at any time.</p>
        <div className={styles.mobileLinks}>
          <Link href="/content-removal/dmca">DMCA</Link><Link href="/content-removal">Content Removal</Link><span>Report Content</span><Link href="/terms">Terms</Link><Link href="/privacy">Privacy</Link><Link href="/cookies">Cookies</Link>{show2257 ? <Link href={section2257Href}>2257</Link> : null}
        </div>
        <span className={styles.mobileCopyright}>© {year} GayVideo.fun</span>
      </div>
    </footer>
  );
}
