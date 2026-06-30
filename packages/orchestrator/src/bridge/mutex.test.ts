import { describe, expect, it } from "vitest";
import { Mutex } from "./mutex.js";

describe("Mutex", () => {
  it("serializes overlapping critical sections (no interleave)", async () => {
    const m = new Mutex();
    const events: string[] = [];
    const task = (id: string) =>
      m.run(async () => {
        events.push(`${id}:start`);
        await new Promise((r) => setTimeout(r, 5));
        events.push(`${id}:end`);
      });

    await Promise.all([task("a"), task("b"), task("c")]);
    // Each task's start/end are adjacent — none interleaves.
    expect(events).toEqual(["a:start", "a:end", "b:start", "b:end", "c:start", "c:end"]);
  });

  it("reports isLocked while a section runs and clears after", async () => {
    const m = new Mutex();
    expect(m.isLocked()).toBe(false);
    const p = m.run(async () => {
      expect(m.isLocked()).toBe(true);
    });
    await p;
    expect(m.isLocked()).toBe(false);
  });

  it("releases the lock even if the body throws", async () => {
    const m = new Mutex();
    await expect(
      m.run(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(m.isLocked()).toBe(false);
    // still usable
    await expect(m.run(async () => 42)).resolves.toBe(42);
  });
});
