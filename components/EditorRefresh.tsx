"use client";

import { useEffect } from "react";

export default function EditorRefresh() {
  useEffect(() => {
    // Reload from persisted AEM state instead of leaving React and UE DOM mutations out of sync.
    let timer: ReturnType<typeof setTimeout>;
    const refresh = (event: Event) => {
      event.stopImmediatePropagation();
      clearTimeout(timer);
      timer = setTimeout(() => window.location.reload(), 150);
    };
    const events = ["add", "move", "patch", "remove", "update"].map(name => `aue:content-${name}`);
    events.forEach(name => document.addEventListener(name, refresh, true));
    return () => {
      clearTimeout(timer);
      events.forEach(name => document.removeEventListener(name, refresh, true));
    };
  }, []);
  return null;
}
