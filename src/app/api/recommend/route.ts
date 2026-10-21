import { createRecommendHandler, recommend } from "@/lib/recommend";
import { readAiConfig } from "@/lib/ai/config";
import { createRemoteRecommend, withRequiredRecommendToken } from "@/lib/ai/remote-recommend";

export const runtime = "nodejs";
const handler = createRecommendHandler({
  recommend: (request, context) => {
    const remote = createRemoteRecommend();
    return remote ? remote(request, context) : recommend(request, { ...context, purpose: readAiConfig().runtimePurpose });
  },
});
export const POST = withRequiredRecommendToken(handler);
