import { describe, expect, it } from "vitest";
import { getTopologyFieldEdges, type TopologyFieldNode } from "../client/src/components/TopologyField";

const node = (id: string): TopologyFieldNode => ({
  id,
  label: id,
  shortLabel: id,
  value: 1,
  detail: "test",
  feature: "patient_records",
  accent: "#8bf0dc",
  position: [0.5, 0.5],
});

describe("TopologyField graph model", () => {
  it("keeps only edges whose endpoints remain accessible", () => {
    expect(getTopologyFieldEdges([node("patients"), node("queue"), node("orders")])).toEqual([
      ["patients", "queue"],
      ["queue", "orders"],
    ]);
  });

  it("returns no dangling edges when a role has fewer than two connected nodes", () => {
    expect(getTopologyFieldEdges([node("pharmacy")])).toEqual([]);
  });
});
