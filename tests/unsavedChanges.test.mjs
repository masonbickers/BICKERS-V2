import test from "node:test";
import assert from "node:assert/strict";
import {
  clearUnsavedChangesState,
  requestGuardedNavigation,
  setUnsavedChangesState,
  UNSAVED_NAVIGATION_REQUEST_EVENT,
} from "../src/app/utils/unsavedChanges.js";

test("guarded navigation runs immediately when no shell handles it", () => {
  let navigated = false;
  requestGuardedNavigation(() => {
    navigated = true;
  });
  assert.equal(navigated, true);
});

test("guarded navigation lets the persistent shell hold a dirty-page action", () => {
  const previousWindow = globalThis.window;
  const fakeWindow = new EventTarget();
  globalThis.window = fakeWindow;

  try {
    setUnsavedChangesState({ ownerId: "test", isDirty: true });
    let navigated = false;
    let pendingAction = null;
    fakeWindow.addEventListener(UNSAVED_NAVIGATION_REQUEST_EVENT, (event) => {
      event.preventDefault();
      pendingAction = event.detail.action;
    });

    requestGuardedNavigation(() => {
      navigated = true;
    });

    assert.equal(navigated, false);
    assert.equal(typeof pendingAction, "function");
    pendingAction();
    assert.equal(navigated, true);
  } finally {
    clearUnsavedChangesState("test");
    if (typeof previousWindow === "undefined") delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});
