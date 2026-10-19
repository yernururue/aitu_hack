import type { FactKey, Poi } from "./contracts/poi";
import type { ProfileId } from "./contracts/request";

export type DemoRankingProfile = {
  preferredCategories: readonly Poi["category"][];
  preferredTags: readonly string[];
  preferredFacts: readonly FactKey[];
};

// Demo preferences only. These are not facts about a user or about a POI.
export const DEMO_RANKING_PROFILES: Readonly<Record<ProfileId, DemoRankingProfile>> = {
  student: {
    preferredCategories: ["cafe"],
    preferredTags: ["учёба", "работа", "coffee", "кофе"],
    preferredFacts: ["outlets", "wifi", "quiet"],
  },
  tourist: {
    preferredCategories: ["museum", "park"],
    preferredTags: ["история", "культура", "architecture", "museum"],
    preferredFacts: [],
  },
  family: {
    preferredCategories: ["park", "museum", "entertainment"],
    preferredTags: ["семья", "дети", "family"],
    preferredFacts: ["childFriendly", "indoor"],
  },
};
