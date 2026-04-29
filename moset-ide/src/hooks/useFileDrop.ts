import { useEffect, useState, useRef } from "react";
import { listen } from "@tauri-apps/api/event";

export function useFileDrop(onDrop: (paths: string[]) => void) {
  const [isDragging, setIsDragging] = useState(false);
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;

  useEffect(() => {
    let unlistenDrop: (() => void) | undefined;
    let unlistenEnter: (() => void) | undefined;
    let unlistenLeave: (() => void) | undefined;

    async function setup() {
      unlistenDrop = await listen<string[]>("global-file-drop", (event) => {
        setIsDragging(false);
        onDropRef.current(event.payload);
      });

      // También podemos escuchar eventos nativos de dragging para feedback visual
      unlistenEnter = await listen("tauri://drag-enter", () => setIsDragging(true));
      unlistenLeave = await listen("tauri://drag-leave", () => setIsDragging(false));
    }

    setup();

    return () => {
      if (unlistenDrop) unlistenDrop();
      if (unlistenEnter) unlistenEnter();
      if (unlistenLeave) unlistenLeave();
    };
  }, []); // Empty deps — listeners are stable, ref captures latest callback

  return { isDragging };
}
