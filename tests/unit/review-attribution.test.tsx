import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PlaceCard } from "@/components/place-card";
import { CatalogSchema } from "@/lib/contracts/poi";
import { RecommendationSchema } from "@/lib/contracts/response";
import fixture from "../../evals/fixtures/places.json";

const attribution = "По отзывам (мнения пользователей):";
function recommendation(includeReview: boolean, citations: "listing" | "review" | "both") {
  const poi = structuredClone(CatalogSchema.parse(fixture).places[0]);
  const listing = { ...poi.sources[0], kind: "listing" as const };
  const review = { ...listing, id: "source:fixture:cited-review", kind: "review" as const };
  poi.sources = includeReview ? [listing, review] : [listing];
  poi.facts = []; poi.price = null;
  return RecommendationSchema.parse({ poi, distanceM: 100, distanceKind: "straight_line", why: "Здесь атмосферно и много места.",
    activity: "Придумайте тему для беседы.", visitMinutes: { min: 20, max: 40, isEstimate: true },
    evidenceIds: citations === "both" ? [listing.id, review.id] : [citations === "review" ? review.id : listing.id],
    navigation: { twoGis: null, googleMaps: "https://www.google.com/maps/dir/?api=1&destination=51.09,71.42" } });
}
function render(item: ReturnType<typeof recommendation>) {
  return renderToStaticMarkup(createElement(PlaceCard, { recommendation: item, saved: false, onSave() {}, onDismiss() {}, onDetails() {} }));
}
function section(html: string, className: string) {
  const value = new RegExp(`<div class="${className}">([\\s\\S]*?)</div>`).exec(html)?.[1];
  expect(value).toBeDefined(); return value!;
}

describe("review attribution in the main recommendation card", () => {
  it.each(["review", "both"] as const)("labels %s evidence as opinion before the unchanged explanation", (citations) => {
    const item = recommendation(true, citations); const before = structuredClone(item); const html = render(item);
    const why = section(html, "recommendation-reason");
    expect(why).toContain("Почему подходит"); expect(why).toContain(attribution); expect(why).toContain(item.why);
    expect(why.indexOf(attribution)).toBeLessThan(why.indexOf(item.why)); expect(why.split(attribution)).toHaveLength(2);
    const activity = section(html, "activity-idea"); expect(activity).toContain("Идея занятия"); expect(activity).toContain(item.activity); expect(activity).not.toContain(attribution);
    expect(html).toContain("Цена не подтверждена"); expect(item).toEqual(before); expect(item.poi.facts).toEqual([]);
  });
  it.each([false, true])("does not label listing evidence as review opinion when uncited review exists=%s", (includeReview) => {
    const item = recommendation(includeReview, "listing"); const html = render(item);
    expect(section(html, "recommendation-reason")).toContain(item.why); expect(html).not.toContain(attribution);
  });
});
