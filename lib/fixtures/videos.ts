import type { Availability, VideoCard } from "../types";

const FIXTURE_NOW = Date.now();
const MINUTE = 60_000;

const titles = [
  "A very long neutral video title used to verify two-line truncation and metadata alignment across card layouts",
  "Morning Gym Session with Marco",
  "Golden Hour on the Rooftop",
  "Road Trip Down the Coast",
  "Sunday Brunch Club",
  "Poolside Summer Afternoon",
  "Back from the Marathon",
  "First Date Stories",
  "Beach Weekend in Mykonos",
  "Late Night Walk Through the City",
  "Cabin Weekend with Friends",
  "Early Morning Yoga Routine",
  "A Quiet Afternoon by the Pool",
  "Training Day at the Local Gym",
  "Sunset Drive Along the Coast",
  "Coffee Before the Morning Run",
  "Weekend Hike Above the City",
  "Dance Practice After Work",
  "Game Night at Home",
  "Cycling the Riverside Route",
  "Breakfast on the Balcony",
  "Summer Day at the Beach House",
  "A Long Walk Through Old Town",
  "Rooftop Stories After Sunset",
  "Morning Swim Before Breakfast",
  "Weekend Escape to the Mountains",
  "A Relaxed Evening at Home",
  "City Lights from the Hotel Roof",
  "Workout Session Before Work",
  "Roadside Coffee on the Way North",
  "Sunny Afternoon in the Park",
  "Friends Meet for Sunday Lunch",
  "Evening Stretch and Mobility",
  "Pool Day During the Heatwave",
  "Train Ride to a New City",
  "Casual Friday at the Studio",
  "Late Breakfast After a Long Night",
  "Running the Harbor Loop",
  "Weekend Market and City Walk",
  "Golden Morning at the Cabin",
  "A Short Hike Before Sunset",
  "Dinner Stories on the Terrace",
  "Morning Workout in the Hotel Gym",
  "Summer Road Trip with Friends",
  "Rainy Evening and Takeout",
  "Beach Walk Before the Crowds",
  "Sunday Yoga on the Rooftop",
  "A Day Exploring the Old District",
  "Poolside Reading and Coffee",
  "Night Drive Across the City",
  "Weekend Sports Practice",
  "Morning Routine Before the Flight",
  "Cozy Cabin Breakfast",
  "Sunset at the Outdoor Pool",
  "Processing Example Video",
  "Removed Example Video",
  "Blocked Example Video",
  "Age Restricted Example Video",
  "Region Restricted Example Video",
  "Failed Example Video",
] as const;

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const edgeAvailability: Availability[] = [
  "PROCESSING",
  "REMOVED",
  "BLOCKED",
  "AGE_RESTRICTED",
  "REGION_RESTRICTED",
  "FAILED",
];

export const videos: VideoCard[] = titles.map((rawTitle, index) => {
  const title = index === 0 ? rawTitle.slice(0, 100) : rawTitle;
  const availability = index >= 54 ? edgeAvailability[index - 54] : "AVAILABLE";
  const durationSeconds =
    index === 3 ? null : index === 5 ? 59 : index === 6 ? 7_200 : 300 + ((index * 173) % 3_200);
  const views = index === 1 ? 0 : index === 2 ? 12_000_000 : 18_000 + index * 42_731;

  return {
    id: `video-${String(index + 1).padStart(3, "0")}`,
    slug: slugify(title) || `video-${index + 1}`,
    title,
    thumbnailUrl:
      index === 4 ? null : `https://picsum.photos/seed/gv-video-${index + 1}/640/360`,
    durationSeconds,
    views,
    publishedAt: new Date(FIXTURE_NOW - index * 18 * MINUTE).toISOString(),
    quality: index % 4 === 0 ? "4K" : "HD",
    hot: index < 20 ? true : undefined,
    isNew: index >= 20 && index < 32 ? true : undefined,
    watchedProgress: index % 9 === 0 ? Math.min(0.92, 0.12 + index / 100) : undefined,
    availability,
  };
});
