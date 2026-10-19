import { SearchExperience, type DatasetInfo } from "@/components/search-experience";
import { loadCatalog } from "@/lib/data/catalog";

export default async function Home() {
  let dataset: DatasetInfo = { available: false, count: 0, synthetic: false };
  try {
    const catalog = await loadCatalog();
    dataset = { available: true, count: catalog.places.length, synthetic: catalog.synthetic };
  } catch {
    // Keep the search shell usable without exposing server paths or import errors.
  }
  return <SearchExperience dataset={dataset} />;
}
