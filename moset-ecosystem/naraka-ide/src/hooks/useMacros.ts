import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

export interface MacroItem {
  id: string;
  name: string;
  path: string;
}

export function useMacros(projectRoot: string | null) {
  const [macros, setMacros] = useState<MacroItem[]>([]);
  const [loading, setLoading] = useState(false);

  const listMacros = useCallback(async () => {
    if (!projectRoot) return;
    setLoading(true);
    try {
      const result = await invoke<MacroItem[]>('list_macros', { projectRoot });
      setMacros(result);
    } catch (e) {
      console.error('Error listing macros:', e);
    } finally {
      setLoading(false);
    }
  }, [projectRoot]);

  const readMacro = useCallback(async (path: string): Promise<string> => {
    try {
      return await invoke<string>('read_macro', { path });
    } catch (e) {
      console.error('Error reading macro:', e);
      throw e;
    }
  }, []);

  const extractVariables = (template: string): string[] => {
    const regex = /\$([A-Z_0-9]+)/g;
    const matches = [...template.matchAll(regex)];
    return Array.from(new Set(matches.map(m => m[1])));
  };

  const interpolateVariables = (template: string, values: Record<string, string>): string => {
    let result = template;
    for (const [key, value] of Object.entries(values)) {
      result = result.replace(new RegExp(`\\$${key}`, 'g'), value);
    }
    return result;
  };

  return {
    macros,
    loading,
    listMacros,
    readMacro,
    extractVariables,
    interpolateVariables
  };
}
