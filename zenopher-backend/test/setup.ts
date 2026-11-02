import { vi } from "vitest";
// The Worker logs one JSON line per request; keep test output readable.
vi.spyOn(console, "log").mockImplementation(() => {});
