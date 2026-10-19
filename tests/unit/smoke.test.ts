import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

describe("UI class composition", () => {
  it("allows a caller to override a conflicting utility", () => {
    expect(cn("px-4 text-sm", "px-6")).toBe("text-sm px-6");
  });

  it("keeps conditional and responsive classes", () => {
    expect(cn("px-4", false && "hidden", { "md:px-8": true })).toBe("px-4 md:px-8");
  });
});
