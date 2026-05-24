import { describe, it, expect } from "vitest";
import { parsePoMoney, parsePoQuantity } from "./poInventory";

describe("poInventory parsers", () => {
  it("parses currency strings", () => {
    expect(parsePoMoney("₹ 1,250.50")).toBe(1250.5);
    expect(parsePoMoney("")).toBe(0);
  });

  it("parses quantities", () => {
    expect(parsePoQuantity("10 boxes")).toBe(10);
    expect(parsePoQuantity(0)).toBe(1);
  });
});
