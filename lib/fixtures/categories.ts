import type { Category } from "../types";

const thumb = (slug: string) => `https://picsum.photos/seed/gv-category-${slug}/640/800`;

export const categories: Category[] = [
  { slug: "muscle", name: "Muscle", count: 5_300, thumbnailUrl: thumb("muscle"), group: "People & Style", trending: true, description: "Videos featuring athletic and muscular styles." },
  { slug: "bear", name: "Bear", count: 34_900, thumbnailUrl: thumb("bear"), group: "People & Style", description: "A broad collection from the Bear category." },
  { slug: "twink", name: "Twink", count: 9_600, thumbnailUrl: thumb("twink"), group: "People & Style", description: "A broad collection from the Twink category." },
  { slug: "mature", name: "Mature", count: 3_200, thumbnailUrl: thumb("mature"), group: "People & Style", description: "A broad collection from the Mature category." },
  { slug: "latino", name: "Latino", count: 6_700, thumbnailUrl: thumb("latino"), group: "People & Style", description: "A broad collection from the Latino category." },
  { slug: "asian", name: "Asian", count: 14_800, thumbnailUrl: thumb("asian"), group: "People & Style", description: "A broad collection from the Asian category." },
  { slug: "fitness", name: "Fitness", count: 34_900, thumbnailUrl: thumb("fitness"), group: "Activities", trending: true, description: "Gym sessions, workouts and active routines." },
  { slug: "sports", name: "Sports", count: 9_600, thumbnailUrl: thumb("sports"), group: "Activities", description: "Training days, games and sports-focused videos." },
  { slug: "yoga", name: "Yoga", count: 3_200, thumbnailUrl: thumb("yoga"), group: "Activities", description: "Yoga, mobility and stretching sessions." },
  { slug: "dance", name: "Dance", count: 6_700, thumbnailUrl: thumb("dance"), group: "Activities", description: "Dance practice, rehearsals and performances." },
  { slug: "massage", name: "Massage", count: 14_800, thumbnailUrl: thumb("massage"), group: "Activities", description: "Relaxed massage and wellness-themed videos." },
  { slug: "gaming", name: "Gaming", count: 2_900, thumbnailUrl: thumb("gaming"), group: "Activities", description: "Gaming nights and casual hangouts." },
  { slug: "beach", name: "Beach", count: 9_600, thumbnailUrl: thumb("beach"), group: "Places", trending: true, description: "Sunny days, coastlines and beach trips." },
  { slug: "outdoors", name: "Outdoors", count: 3_200, thumbnailUrl: thumb("outdoors"), group: "Places", trending: true, description: "Outdoor trips, trails and open-air settings." },
  { slug: "travel", name: "Travel", count: 6_700, thumbnailUrl: thumb("travel"), group: "Places", description: "Trips, weekend escapes and travel diaries." },
  { slug: "city", name: "City", count: 14_800, thumbnailUrl: thumb("city"), group: "Places", description: "City walks, rooftops and urban weekends." },
  { slug: "pool", name: "Pool", count: 2_900, thumbnailUrl: thumb("pool"), group: "Places", description: "Poolside afternoons and summer hangouts." },
  { slug: "cabin", name: "Cabin", count: 7_400, thumbnailUrl: thumb("cabin"), group: "Places", description: "Quiet cabin stays and weekend getaways." },
  { slug: "romantic", name: "Romantic", count: 3_200, thumbnailUrl: thumb("romantic"), group: "Mood", trending: true, description: "Warm, date-night and romantic stories." },
  { slug: "playful", name: "Playful", count: 6_700, thumbnailUrl: thumb("playful"), group: "Mood", description: "Lighthearted, playful videos and stories." },
  { slug: "chill", name: "Chill", count: 14_800, thumbnailUrl: thumb("chill"), group: "Mood", description: "Relaxed days, casual conversations and downtime." },
  { slug: "late-night", name: "Late Night", count: 2_900, thumbnailUrl: thumb("late-night"), group: "Mood", description: "Late-night city, home and weekend moments." },
  { slug: "sunny-days", name: "Sunny Days", count: 7_400, thumbnailUrl: thumb("sunny-days"), group: "Mood", description: "Bright afternoons and sunny-day videos." },
  { slug: "cozy", name: "Cozy", count: 4_600, thumbnailUrl: thumb("cozy"), group: "Mood", description: "Cozy indoor moments and quiet weekends." },
];
