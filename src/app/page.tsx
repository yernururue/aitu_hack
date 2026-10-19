import { connection } from "next/server";
import { configuredAiMode } from "@/lib/search/intent";
import { SearchExperience, type DatasetInfo } from "@/components/search-experience";
import { loadCatalog } from "@/lib/data/catalog";

export default async function Home() {
  // Read mode with the incoming request, not while prerendering a deployment.
  await connection();
  const aiMode = configuredAiMode();
  let dataset: DatasetInfo = { available: false, count: 0, synthetic: false };
  try {
    const catalog = await loadCatalog();
    dataset = { available: true, count: catalog.places.length, synthetic: catalog.synthetic };
  } catch {
    // Keep the search shell usable without exposing server paths or import errors.
  }
  return <SearchExperience dataset={dataset} aiMode={aiMode} />;
}
