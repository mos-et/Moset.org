import { useState, useEffect } from "react";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

// ─── Model Discovery Cache ───────────────────────────────────────────────────
// Caches model lists per provider URL to avoid redundant API calls
// when switching sessions or toggling settings.
// TTL: 5 minutes (300_000ms)

interface ModelEntry {
  id: string;
  name: string;
}

interface CacheEntry {
  models: ModelEntry[];
  timestamp: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const modelCache = new Map<string, CacheEntry>();

function getCacheKey(url: string, apiKey: string): string {
  // Include a hash of the API key to differentiate authenticated vs unauthenticated requests
  const keyHash = apiKey ? apiKey.slice(-8) : "nokey";
  return `${url}::${keyHash}`;
}

export function useModelDiscovery(provider: string, baseUrl: string, apiKey: string) {
  const [models, setModels] = useState<ModelEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (provider === "soberano") {
      setModels([]);
      setError(null);
      return;
    }

    let url = "";
    if (provider === "nube") {
      url = "https://openrouter.ai/api/v1/models";
    } else if (provider === "custom") {
      if (!baseUrl || baseUrl.length < 10) return;
      url = baseUrl.endsWith("/") ? `${baseUrl}models` : `${baseUrl}/models`;
    }

    if (!url) return;

    // Check cache first
    const cacheKey = getCacheKey(url, apiKey);
    const cached = modelCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL_MS) {
      setModels(cached.models);
      setError(null);
      setLoading(false);
      return;
    }

    // Debounced fetch
    const timeoutId = setTimeout(async () => {
      setLoading(true);
      setError(null);

      try {
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

        const response = await tauriFetch(url, { headers, method: "GET" });
        if (response.ok) {
          const data = await response.json();
          const modelsList = data.data || data;
          if (Array.isArray(modelsList)) {
            const parsed = modelsList.map((m: any) => ({
              id: m.id,
              name: m.name || m.id,
            }));
            setModels(parsed);
            // Store in cache
            modelCache.set(cacheKey, { models: parsed, timestamp: Date.now() });
          } else {
            setError("Formato de modelos inválido.");
          }
        } else {
          setError(`Error ${response.status}: ${response.statusText}`);
        }
      } catch (e: any) {
        console.error("Error al cargar modelos:", e);
        setError("Fallo de red o CORS.");
      } finally {
        setLoading(false);
      }
    }, 1000);

    return () => clearTimeout(timeoutId);
  }, [provider, baseUrl, apiKey]);

  const invalidateCache = () => {
    modelCache.clear();
  };

  return { models, loading, error, invalidateCache };
}
