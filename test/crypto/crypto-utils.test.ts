import { describe, expect, it } from "bun:test";
import { constantTimeEqual, zeroize } from "../../src/crypto/crypto-utils.js";

describe("constantTimeEqual", () => {
  it("returns true for identical arrays", () => {
    const a = new Uint8Array([1, 2, 3, 4]);
    const b = new Uint8Array([1, 2, 3, 4]);
    expect(constantTimeEqual(a, b)).toBe(true);
  });

  it("returns false for different arrays", () => {
    const a = new Uint8Array([1, 2, 3, 4]);
    const b = new Uint8Array([1, 2, 3, 5]);
    expect(constantTimeEqual(a, b)).toBe(false);
  });

  it("returns false for different lengths", () => {
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([1, 2, 3, 4]);
    expect(constantTimeEqual(a, b)).toBe(false);
  });

  it("returns true for empty arrays", () => {
    expect(constantTimeEqual(new Uint8Array(0), new Uint8Array(0))).toBe(true);
  });

  it("returns false when only first byte differs", () => {
    const a = new Uint8Array([0, 2, 3, 4]);
    const b = new Uint8Array([1, 2, 3, 4]);
    expect(constantTimeEqual(a, b)).toBe(false);
  });

  it("returns false when only last byte differs", () => {
    const a = new Uint8Array([1, 2, 3, 4]);
    const b = new Uint8Array([1, 2, 3, 0]);
    expect(constantTimeEqual(a, b)).toBe(false);
  });
});

describe("zeroize", () => {
  it("fills array with zeros", () => {
    const arr = new Uint8Array([1, 2, 3, 4, 5]);
    zeroize(arr);
    expect(arr).toEqual(new Uint8Array(5));
  });

  it("handles empty array", () => {
    const arr = new Uint8Array(0);
    zeroize(arr);
    expect(arr.length).toBe(0);
  });

  it("zeroizes multiple arrays", () => {
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([4, 5, 6, 7]);
    zeroize(a, b);
    expect(a).toEqual(new Uint8Array(3));
    expect(b).toEqual(new Uint8Array(4));
  });

  it("zeroizes large arrays", () => {
    const arr = new Uint8Array(1024);
    arr.fill(0xff);
    zeroize(arr);
    expect(arr.every((b) => b === 0)).toBe(true);
  });
});
