import { Thumbnail } from "@/components/cards/Thumbnail";
import { Icon } from "@/components/primitives";
import { formatViews } from "@/lib/format";
import type { Category, Tag, VideoCard } from "@/lib/types";

import styles from "./SearchSuggestions.module.css";

export type SuggestionData = {
  trending: string[];
  tags: Tag[];
  categories: Category[];
  videos: VideoCard[];
};

export type SuggestionOption = {
  id: string;
  kind: "recent" | "trending" | "tag" | "category" | "video";
  label: string;
  href: string;
  video?: VideoCard;
};

type Props = {
  id: string;
  query: string;
  data: SuggestionData;
  recent: string[];
  activeId?: string;
  variant?: "desktop" | "mobile";
  onSelect: (option: SuggestionOption) => void;
  onRemoveRecent?: (value: string) => void;
  onClearRecent?: () => void;
};

const searchHref = (value: string) => `/search?q=${encodeURIComponent(value)}`;

export function buildKeyboardOptions(
  data: SuggestionData,
  recent: string[],
  query: string,
  variant: "desktop" | "mobile",
): SuggestionOption[] {
  const trending = data.trending.map((label, index) => ({
    id: `trending-${index}`, kind: "trending" as const, label, href: searchHref(label),
  }));
  const tags = data.tags.map((tag) => ({
    id: `tag-${tag.slug}`, kind: "tag" as const, label: tag.name, href: `/tag/${tag.slug}`,
  }));
  const categories = data.categories.map((category) => ({
    id: `category-${category.slug}`, kind: "category" as const, label: category.name, href: `/category/${category.slug}`,
  }));
  const videos = data.videos.map((video) => ({
    id: `video-${video.id}`, kind: "video" as const, label: video.title, href: `/watch/${video.slug}`, video,
  }));
  const recents = recent.slice(0, 3).map((label, index) => ({
    id: `recent-${index}`, kind: "recent" as const, label, href: searchHref(label),
  }));

  if (variant === "mobile" && !query.trim()) {
    return [...recents, ...trending.slice(0, 4), ...tags.slice(0, 6), ...categories.slice(0, 3)];
  }
  if (variant === "mobile") {
    return [...trending, ...tags, ...categories].slice(0, 4).concat(videos.slice(0, 2));
  }
  return [...trending, ...tags, ...categories].slice(0, 6).concat(recents, videos.slice(0, 3));
}

function Row({ option, activeId, onSelect, arrow = false }: {
  option: SuggestionOption;
  activeId?: string;
  onSelect: Props["onSelect"];
  arrow?: boolean;
}) {
  const icon = option.kind === "recent" ? "history" : option.kind === "tag" ? "tag" : option.kind === "category" ? "category" : "search";
  return (
    <button id={option.id} type="button" role="option" aria-selected={activeId === option.id}
      className={styles.row} data-active={activeId === option.id || undefined}
      onMouseDown={(event) => event.preventDefault()} onClick={() => onSelect(option)}>
      <Icon name={icon} className={styles.rowIcon} />
      <span className={styles.rowText}>{option.label}</span>
      {option.kind === "tag" ? <span className={styles.kind}>Tag</span> : null}
      {option.kind === "category" ? <span className={styles.kind}>Category</span> : null}
      {arrow ? <Icon name="north_west" className={styles.arrow} /> : null}
    </button>
  );
}

function VideoRow({ option, activeId, onSelect }: {
  option: SuggestionOption;
  activeId?: string;
  onSelect: Props["onSelect"];
}) {
  if (!option.video) return null;
  return (
    <button id={option.id} type="button" role="option" aria-selected={activeId === option.id}
      className={styles.videoRow} data-active={activeId === option.id || undefined}
      onMouseDown={(event) => event.preventDefault()} onClick={() => onSelect(option)}>
      <Thumbnail src={option.video.thumbnailUrl} alt="" durationSeconds={option.video.durationSeconds} className={styles.thumb} />
      <span className={styles.videoCopy}>
        <span className={styles.videoTitle}>{option.video.title}</span>
        <span className={styles.videoMeta}>{formatViews(option.video.views)}</span>
      </span>
    </button>
  );
}

function Desktop(props: Props) {
  const options = buildKeyboardOptions(props.data, props.recent, props.query, "desktop");
  const left = options.filter((item) => item.kind !== "video");
  const videos = options.filter((item) => item.kind === "video");
  return (
    <div id={props.id} role="listbox" aria-label="Search suggestions" className={styles.desktop}>
      <div className={styles.left}>
        <span className={styles.eyebrow}>SUGGESTIONS</span>
        {left.filter((item) => item.kind !== "recent").map((item) => <Row key={item.id} option={item} activeId={props.activeId} onSelect={props.onSelect} />)}
        {props.recent.length ? <span className={styles.eyebrow}>RECENT</span> : null}
        {left.filter((item) => item.kind === "recent").map((item) => (
          <div className={styles.recent} key={item.id}>
            <Row option={item} activeId={props.activeId} onSelect={props.onSelect} />
            {props.onRemoveRecent ? <button type="button" className={styles.remove} aria-label={`Remove ${item.label} from recent searches`} onClick={() => props.onRemoveRecent?.(item.label)}><Icon name="close" /></button> : null}
          </div>
        ))}
        {props.recent.length && props.onClearRecent ? <button type="button" className={styles.clearHistory} onClick={props.onClearRecent}>Clear history</button> : null}
      </div>
      <div className={styles.right}>
        {videos.length ? <span className={styles.eyebrow}>MATCHING VIDEOS</span> : null}
        {videos.map((item) => <VideoRow key={item.id} option={item} activeId={props.activeId} onSelect={props.onSelect} />)}
        <span className={styles.eyebrow}>TRENDING SEARCHES</span>
        <div className={styles.chips}>
          {props.data.trending.slice(0, 5).map((label, index) => (
            <button key={label} type="button" className={styles.chip} onClick={() => props.onSelect({ id: `trend-chip-${index}`, kind: "trending", label, href: searchHref(label) })}>
              <Icon name="trending_up" className={styles.trendIcon} />{label}
            </button>
          ))}
        </div>
        {!left.length && !videos.length && props.query ? <div className={styles.empty}><strong>No videos found</strong><span>Try another keyword</span></div> : null}
        <div className={styles.help} aria-hidden="true"><span>↑↓ navigate</span><span>↵ open</span><span>esc close</span></div>
      </div>
    </div>
  );
}

function Mobile(props: Props) {
  const options = buildKeyboardOptions(props.data, props.recent, props.query, "mobile");
  if (props.query.trim()) {
    const text = options.filter((item) => item.kind !== "video");
    const videos = options.filter((item) => item.kind === "video");
    return (
      <div id={props.id} role="listbox" aria-label="Search suggestions" className={styles.mobile}>
        {text.map((item) => <Row key={item.id} option={item} activeId={props.activeId} onSelect={props.onSelect} arrow />)}
        {videos.length ? <h2 className={styles.mobileHeading}>Matching videos</h2> : null}
        <div className={styles.mobileVideos}>{videos.map((item) => <VideoRow key={item.id} option={item} activeId={props.activeId} onSelect={props.onSelect} />)}</div>
        {!text.length && !videos.length ? <div className={styles.mobileEmpty}><strong>No videos found</strong><span>Try another keyword</span></div> : null}
        <button type="button" className={styles.seeAll} onClick={() => props.onSelect({ id: "see-all", kind: "trending", label: props.query, href: searchHref(props.query) })}>
          See all results for &quot;{props.query}&quot;<Icon name="arrow_forward" />
        </button>
      </div>
    );
  }

  const recents = options.filter((item) => item.kind === "recent");
  const trending = options.filter((item) => item.kind === "trending");
  return (
    <div id={props.id} role="listbox" aria-label="Search suggestions" className={styles.mobile}>
      {recents.length ? <div className={styles.headingRow}><h2 className={styles.mobileHeading}>Recent</h2>{props.onClearRecent ? <button type="button" className={styles.clearAll} onClick={props.onClearRecent}>Clear all</button> : null}</div> : null}
      {recents.map((item) => <div className={styles.mobileRecent} key={item.id}><Row option={item} activeId={props.activeId} onSelect={props.onSelect} />{props.onRemoveRecent ? <button type="button" className={styles.remove} aria-label={`Remove ${item.label} from recent searches`} onClick={() => props.onRemoveRecent?.(item.label)}><Icon name="close" /></button> : null}</div>)}
      <h2 className={styles.mobileHeading}>Trending searches</h2>
      {trending.map((item, index) => <button key={item.id} id={item.id} type="button" role="option" aria-selected={props.activeId === item.id} className={styles.trendingRow} data-active={props.activeId === item.id || undefined} onClick={() => props.onSelect(item)}><span className={styles.rank}>{index + 1}</span>{item.label}<Icon name="trending_up" className={styles.trendIcon} /></button>)}
      <h2 className={styles.mobileHeading}>Popular tags</h2>
      <div className={styles.tagWrap}>{props.data.tags.slice(0, 6).map((tag) => <button key={tag.slug} type="button" className={styles.tag} onClick={() => props.onSelect({ id: `tag-${tag.slug}`, kind: "tag", label: tag.name, href: `/tag/${tag.slug}` })}>#{tag.name}</button>)}</div>
      <h2 className={styles.mobileHeading}>Suggested categories</h2>
      <div className={styles.categories}>{props.data.categories.slice(0, 3).map((category) => <button key={category.slug} type="button" className={styles.category} onClick={() => props.onSelect({ id: `category-${category.slug}`, kind: "category", label: category.name, href: `/category/${category.slug}` })}><Thumbnail src={category.thumbnailUrl} alt="" className={styles.categoryThumb} /><span>{category.name}</span></button>)}</div>
    </div>
  );
}

export function SearchSuggestions(props: Props) {
  return props.variant === "mobile" ? <Mobile {...props} /> : <Desktop {...props} />;
}
