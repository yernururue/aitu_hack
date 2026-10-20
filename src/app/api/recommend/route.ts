import { createRecommendHandler, recommend } from "@/lib/recommend";
import { readAiConfig } from "@/lib/ai/config";

export const runtime = "nodejs";
export const POST = createRecommendHandler({
  recommend: (request, context) => recommend(request, { ...context, purpose: readAiConfig().runtimePurpose }),
});
