import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type NavVisibilityMap = Record<string, boolean>; // key -> hidden

const CACHE_KEY = "slowrun:nav_visibility";

function readCache(): NavVisibilityMap {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as NavVisibilityMap) : {};
  } catch {
    return {};
  }
}

export async function fetchNavVisibility(): Promise<NavVisibilityMap> {
  const { data, error } = await supabase.from("nav_visibility").select("key, hidden");
  if (error || !data) return {};
  const map: NavVisibilityMap = {};
  for (const row of data as { key: string; hidden: boolean }[]) map[row.key] = Boolean(row.hidden);
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
  return map;
}

export function useNavVisibility() {
  const [hiddenMap, setHiddenMap] = useState<NavVisibilityMap>(() => readCache());
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    const map = await fetchNavVisibility();
    setHiddenMap(map);
    setLoaded(true);
    return map;
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const isHidden = useCallback((key: string) => Boolean(hiddenMap[key]), [hiddenMap]);

  return { hiddenMap, isHidden, loaded, refresh, setHiddenMap };
}
