import { beforeEach, describe, expect, it } from "vitest";

import {
  selectSelectedSignalKey,
  useUiStore,
} from "./ui-store";

describe("ui-store", () => {
  beforeEach(() => {
    useUiStore.setState({ selectedSignalKey: null });
  });

  it("starts without a selected signal", () => {
    expect(selectSelectedSignalKey(useUiStore.getState())).toBeNull();
  });

  it("sets and clears the selected signal key", () => {
    useUiStore.getState().setSelectedSignalKey("condition-a:asset-a");

    expect(selectSelectedSignalKey(useUiStore.getState())).toBe(
      "condition-a:asset-a",
    );

    useUiStore.getState().clearSelectedSignalKey();

    expect(selectSelectedSignalKey(useUiStore.getState())).toBeNull();
  });
});
