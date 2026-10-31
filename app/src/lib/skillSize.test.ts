import { describe, expect, it } from "vitest";

import { formatBytes } from "@/lib/skillSize";

describe("formatBytes", () => {
  it("keeps sub-kilobyte sizes in bytes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1023)).toBe("1023 B");
  });

  it("shows kilobytes with one decimal above 1 KiB", () => {
    expect(formatBytes(1024)).toBe("1.0 KiB");
    expect(formatBytes(2048)).toBe("2.0 KiB");
    expect(formatBytes(32 * 1024 + 512)).toBe("32.5 KiB");
  });
});
