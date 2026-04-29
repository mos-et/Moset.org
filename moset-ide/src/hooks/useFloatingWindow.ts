import { useState, useRef, useEffect } from "react";

interface FloatingWindowOptions {
  storagePrefix: string;
  defaultWidth: number;
  defaultHeight: number;
  defaultPosX: number;
  defaultPosY: number;
}

export function useFloatingWindow({
  storagePrefix,
  defaultWidth,
  defaultHeight,
  defaultPosX,
  defaultPosY,
}: FloatingWindowOptions) {
  const [width, setWidth] = useState<number>(() => {
    return parseInt(localStorage.getItem(`${storagePrefix}_width`) || defaultWidth.toString(), 10);
  });
  const [height, setHeight] = useState<number>(() => {
    return parseInt(localStorage.getItem(`${storagePrefix}_height`) || defaultHeight.toString(), 10);
  });
  const [isFloating, setIsFloating] = useState<boolean>(() => {
    return localStorage.getItem(`${storagePrefix}_floating`) === "true";
  });
  const [pos, setPos] = useState<{ x: number; y: number }>(() => {
    const saved = localStorage.getItem(`${storagePrefix}_pos`);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {}
    }
    return { x: defaultPosX, y: defaultPosY };
  });

  useEffect(() => {
    localStorage.setItem(`${storagePrefix}_width`, width.toString());
  }, [width, storagePrefix]);

  useEffect(() => {
    localStorage.setItem(`${storagePrefix}_height`, height.toString());
  }, [height, storagePrefix]);

  useEffect(() => {
    localStorage.setItem(`${storagePrefix}_floating`, isFloating.toString());
  }, [isFloating, storagePrefix]);

  useEffect(() => {
    localStorage.setItem(`${storagePrefix}_pos`, JSON.stringify(pos));
  }, [pos, storagePrefix]);

  const isResizingRef = useRef(false);
  const isResizingFloatingRef = useRef(false);
  const isDraggingRef = useRef(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  // DISEÑO-4: Track width in a ref to avoid re-binding listeners on every resize frame
  const widthRef = useRef(width);
  useEffect(() => { widthRef.current = width; }, [width]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizingRef.current) {
        // Modo acoplado (ahora está a la izquierda del editor, cambia width desde el lado derecho)
        setWidth((prev) => {
          let newWidth = prev + e.movementX;
          if (newWidth < 300) newWidth = 300;
          if (newWidth > 1200) newWidth = 1200;
          return newWidth;
        });
      } else if (isResizingFloatingRef.current) {
        // Redimensión libre para ventana flotante desde la esquina inferior derecha
        setWidth((prev) => Math.max(300, prev + e.movementX));
        setHeight((prev) => Math.max(300, prev + e.movementY));
      } else if (isDraggingRef.current) {
        // Clampar posición dentro del viewport (usa ref para evitar stale closure)
        const maxX = window.innerWidth - widthRef.current;
        const maxY = window.innerHeight - 60; // Leave room for title bar
        setPos({
          x: Math.max(0, Math.min(e.clientX - dragOffsetRef.current.x, maxX)),
          y: Math.max(0, Math.min(e.clientY - dragOffsetRef.current.y, maxY)),
        });
      }
    };

    const handleMouseUp = () => {
      if (isResizingRef.current) {
        isResizingRef.current = false;
        document.body.style.cursor = "default";
      }
      if (isResizingFloatingRef.current) {
        isResizingFloatingRef.current = false;
        document.body.style.cursor = "default";
      }
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        document.body.style.cursor = "default";
        document.body.style.userSelect = "auto";
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []); // No dependencies — refs handle all mutable state

  const onDragStart = (e: React.MouseEvent) => {
    if (!isFloating) return;
    isDraggingRef.current = true;
    dragOffsetRef.current = {
      x: e.clientX - pos.x,
      y: e.clientY - pos.y,
    };
    document.body.style.userSelect = "none";
  };

  const startResizing = (e: React.MouseEvent) => {
    e.preventDefault();
    isResizingRef.current = true;
    document.body.style.cursor = "col-resize";
  };

  const startResizingFloating = (e: React.MouseEvent) => {
    e.preventDefault();
    isResizingFloatingRef.current = true;
    document.body.style.cursor = "nwse-resize";
  };

  return {
    width,
    height,
    pos,
    isFloating,
    setWidth,
    setHeight,
    setPos,
    setIsFloating,
    onDragStart,
    startResizing,
    startResizingFloating,
  };
}
