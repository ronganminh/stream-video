import type { CSSProperties, ReactNode } from "react";

import {
  Badge,
  Button,
  Icon,
  IconButton,
  TagChip,
  Tabs,
} from "@/components/primitives";

const sheetStyle: CSSProperties = {
  width: "min(1180px, calc(100% - 32px))",
  margin: "32px auto",
  padding: 48,
  boxSizing: "border-box",
  border: "1px solid var(--gv-border)",
  borderRadius: "var(--gv-radius-lg)",
  background: "var(--gv-bg)",
  color: "var(--gv-text)",
  display: "flex",
  flexDirection: "column",
  gap: 40,
};

const rowStyle: CSSProperties = {
  display: "flex",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
  marginTop: 16,
};

const splitStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 40,
};

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontFamily: "var(--gv-font-mono)",
        fontSize: 11,
        fontWeight: 500,
        lineHeight: 1,
        letterSpacing: ".14em",
        color: "var(--gv-text-muted)",
      }}
    >
      {children}
    </div>
  );
}

export default function PrimitivesPage() {
  return (
    <main style={{ minHeight: "100vh", paddingBlock: 1 }}>
      <section style={sheetStyle}>
        <div>
          <SectionLabel>
            BUTTON · Primary / Secondary / Ghost / Icon / Danger
          </SectionLabel>
          <div style={rowStyle}>
            <Button>Primary</Button>
            <Button
              style={{ transform: "scale(.97)", filter: "brightness(.94)" }}
            >
              Pressed
            </Button>
            <Button variant="secondary">
              <Icon name="bookmark" style={{ fontSize: 19 }} />
              Secondary
            </Button>
            <Button
              variant="secondary"
              style={{
                background: "var(--gv-surface-hover)",
                borderColor: "transparent",
              }}
            >
              Hover
            </Button>
            <Button
              variant="secondary"
              style={{
                borderColor: "transparent",
                boxShadow: "var(--gv-focus)",
              }}
            >
              Focus
            </Button>
            <Button variant="ghost">Ghost</Button>
            <IconButton aria-label="Share">
              <Icon name="ios_share" style={{ fontSize: 22 }} />
            </IconButton>
            <IconButton aria-label="Next" variant="overlay">
              <Icon name="chevron_right" style={{ fontSize: 22 }} />
            </IconButton>
            <Button variant="danger">
              <Icon name="flag" style={{ fontSize: 19 }} />
              Submit report
            </Button>
          </div>
        </div>

        <div style={splitStyle}>
          <div>
            <SectionLabel>TAG · Default / Hover / Selected / Focus</SectionLabel>
            <div style={{ ...rowStyle, gap: 8 }}>
              <TagChip href="/tag/fitness">#Fitness</TagChip>
              <TagChip
                href="/tag/beach"
                style={{
                  background: "var(--gv-surface-3)",
                  color: "var(--gv-text)",
                }}
              >
                #Beach
              </TagChip>
              <TagChip href="/tag/muscle" selected>
                #Muscle
              </TagChip>
              <TagChip
                href="/tag/latino"
                style={{ boxShadow: "var(--gv-focus)" }}
              >
                #Latino
              </TagChip>
              <TagChip filter selected>
                #Workout
              </TagChip>
            </div>
          </div>

          <div>
            <SectionLabel>BADGE</SectionLabel>
            <div style={{ ...rowStyle, gap: 8 }}>
              <Badge variant="hot" />
              <Badge variant="trending" />
              <Badge variant="new" />
              <Badge variant="quality">4K</Badge>
              <Badge variant="duration">24:16</Badge>
              <Badge variant="18+" />
              <Badge variant="ad" />
              <Badge variant="most-watched" rank={1} />
            </div>
          </div>
        </div>

        <div>
          <SectionLabel>TABS / SEGMENTED</SectionLabel>
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 28,
              flexWrap: "wrap",
              marginTop: 16,
            }}
          >
            <Tabs
              ariaLabel="Time window"
              defaultValue="today"
              items={[
                { id: "today", label: "Today" },
                { id: "week", label: "Week" },
                { id: "month", label: "Month" },
                { id: "all", label: "All Time" },
              ]}
            />
            <Tabs
              ariaLabel="Video section"
              variant="underline"
              defaultValue="up-next"
              items={[
                { id: "up-next", label: "Up next" },
                { id: "related", label: "Related" },
                { id: "popular", label: "Popular" },
              ]}
            />
          </div>
        </div>

        <div>
          <SectionLabel>BUTTON · Sizes / Disabled / Loading</SectionLabel>
          <div style={rowStyle}>
            <Button size="sm">Small · 36</Button>
            <Button size="md">Medium · 44</Button>
            <Button size="lg">Large · 50</Button>
            <Button disabled>Primary disabled</Button>
            <Button variant="secondary" disabled>
              <Icon name="bookmark" style={{ fontSize: 19 }} />
              Secondary disabled
            </Button>
            <Button loading>Applying…</Button>
            <Button variant="secondary" loading>
              Loading
            </Button>
          </div>
        </div>

        <div>
          <SectionLabel>ICON BUTTON · Surface / Ghost / Overlay</SectionLabel>
          <div style={rowStyle}>
            <IconButton aria-label="Save">
              <Icon name="bookmark" style={{ fontSize: 22 }} />
            </IconButton>
            <IconButton aria-label="Share" variant="ghost">
              <Icon name="ios_share" style={{ fontSize: 22 }} />
            </IconButton>
            <IconButton aria-label="Play" variant="overlay">
              <Icon
                name="play_arrow"
                style={{ fontSize: 24, fontVariationSettings: "'FILL' 1" }}
              />
            </IconButton>
          </div>
        </div>

        <div>
          <SectionLabel>BUTTON · Link rendering</SectionLabel>
          <div style={rowStyle}>
            <Button href="/hot">Open Hot</Button>
            <Button href="/categories" variant="secondary">
              Browse categories
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}
