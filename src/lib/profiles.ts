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

export const DEMO_PROFILE_LABELS: Readonly<Record<ProfileId, string>> = { student: "Студент", tourist: "Турист", family: "Семья" };
export const DEMO_PROFILE_DESCRIPTIONS: Readonly<Record<ProfileId, string>> = {
  student: "Учебный пример интересов: кофе, учёба и работа вне дома.",
  tourist: "Учебный пример интересов: музеи, прогулки и культура города.",
  family: "Учебный пример интересов: прогулки и занятия с детьми.",
};
