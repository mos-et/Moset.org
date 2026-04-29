import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface TreeNode {
  name: string;
  path: string;
  is_dir: boolean;
  children?: TreeNode[];
}

export interface MosetFile {
  name: string;
  content: string;
  path: string;
}

export function useFileSystem() {
  const [projectRoot, setProjectRoot] = useState<string>("");
  const [fileSystem, setFileSystem] = useState<TreeNode[]>([]);
  const [openFiles, setOpenFiles] = useState<MosetFile[]>([]);
  const [activeFileIndex, setActiveFileIndex] = useState<number>(0);
  const [isTreeLoading, setIsTreeLoading] = useState<boolean>(false);

  const activeFile = openFiles[activeFileIndex] || null;

  const loadDirectoryTree = useCallback(async (path: string) => {
    setIsTreeLoading(true);
    try {
      const nodes: TreeNode[] = await invoke("read_directory", { path, maxDepth: 3 });
      setFileSystem(nodes);
    } catch (error) {
      console.error("Error reading directory:", error);
    } finally {
      setIsTreeLoading(false);
    }
  }, []);

  const openFile = useCallback(async (fullPath: string, fileName: string) => {
    try {
      const content = await invoke<string>("read_file_content", { path: fullPath });
      
      setOpenFiles((prev) => {
        const existingIndex = prev.findIndex((f) => f.path === fullPath);
        if (existingIndex !== -1) {
          setActiveFileIndex(existingIndex);
          return prev;
        }

        const newFiles = [...prev, { name: fileName, content, path: fullPath }];
        setActiveFileIndex(newFiles.length - 1);
        return newFiles;
      });
    } catch (error) {
      console.error("No se pudo leer el archivo:", error);
    }
  }, []);

  const saveActiveFile = useCallback(async (content: string) => {
    if (!activeFile) return;

    try {
      await invoke("save_file_content", {
        path: activeFile.path,
        content: content,
      });

      // Update local state
      setOpenFiles(prev => {
        const copy = [...prev];
        copy[activeFileIndex].content = content;
        return copy;
      });
      // Archivo guardado exitosamente
    } catch (error) {
      console.error("Error al guardar archivo:", error);
    }
  }, [activeFile, activeFileIndex]);

  const closeFile = useCallback((indexToRemove: number) => {
    setOpenFiles(prev => {
      const copy = [...prev];
      copy.splice(indexToRemove, 1);
      return copy;
    });
    
    if (activeFileIndex >= indexToRemove && activeFileIndex > 0) {
      setActiveFileIndex(prev => prev - 1);
    }
  }, [activeFileIndex]);

  return {
    projectRoot,
    setProjectRoot,
    fileSystem,
    loadDirectoryTree,
    isTreeLoading,
    openFiles,
    activeFile,
    activeFileIndex,
    setActiveFileIndex,
    openFile,
    saveActiveFile,
    closeFile,
  };
}
