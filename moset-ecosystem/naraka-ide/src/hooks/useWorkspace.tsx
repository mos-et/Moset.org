import React, { createContext, useContext, useState, ReactNode, useEffect } from "react";
import { FileTab } from "../utils/fileTypes";
import { INITIAL_TABS } from "../utils/constants";

interface WorkspaceContextProps {
  tabs: FileTab[];
  activeTab: string | null;
  setTabs: React.Dispatch<React.SetStateAction<FileTab[]>>;
  setActiveTab: React.Dispatch<React.SetStateAction<string | null>>;
  addTab: (tab: FileTab) => void;
  removeTab: (id: string) => void;
  updateTabContent: (id: string, content: string) => void;
}

const WorkspaceContext = createContext<WorkspaceContextProps | undefined>(undefined);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [tabs, setTabs] = useState<FileTab[]>(() => {
    const saved = localStorage.getItem("moset_ide_tabs");
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    return INITIAL_TABS;
  });

  const [activeTab, setActiveTab] = useState<string | null>(() => {
    return localStorage.getItem("moset_ide_active_tab") || "main";
  });

  // Keep tabs synced with localStorage automatically
  useEffect(() => {
    localStorage.setItem("moset_ide_tabs", JSON.stringify(tabs));
  }, [tabs]);

  useEffect(() => {
    if (activeTab) localStorage.setItem("moset_ide_active_tab", activeTab);
  }, [activeTab]);

  const addTab = (tab: FileTab) => {
    setTabs(prev => {
      if (!prev.find(t => t.id === tab.id)) {
        return [...prev, tab];
      }
      return prev;
    });
    setActiveTab(tab.id);
  };

  const removeTab = (id: string) => {
    setTabs(prev => {
      const newTabs = prev.filter(t => t.id !== id);
      if (activeTab === id) {
        if (newTabs.length > 0) setActiveTab(newTabs[newTabs.length - 1].id);
        else setActiveTab(null);
      }
      return newTabs;
    });
  };

  const updateTabContent = (id: string, content: string) => {
    setTabs(prev => prev.map(t => t.id === id ? { ...t, content, modified: true } : t));
  };

  return (
    <WorkspaceContext.Provider value={{ tabs, activeTab, setTabs, setActiveTab, addTab, removeTab, updateTabContent }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error("useWorkspace debe ser usado dentro de un WorkspaceProvider");
  }
  return context;
}
