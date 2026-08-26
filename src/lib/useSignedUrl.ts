"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Entry = { url: string; expiresAt: number };
const cache = new Map<string, Entry>();

export function useSignedUrl(clipId: string | null, kind: "video" | "audio") {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const supabase = useRef(createClient());

  const fetchUrl = useCallback(async () => {
    if (!clipId) return;
    const cacheKey = `${clipId}:${kind}`;

    const hit = cache.get(cacheKey);
    if (hit && hit.expiresAt - Date.now() > 300_000) {
      setUrl(hit.url);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.current.auth.getSession();
      if (!session) throw new Error("not signed in");

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/sign-clip`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ clipId, kind }),
        },
      );
      if (!res.ok) throw new Error(`sign-clip ${res.status}`);

      const json = (await res.json()) as Entry;
      cache.set(cacheKey, json);
      setUrl(json.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [clipId, kind]);

  useEffect(() => {
    void fetchUrl();
  }, [fetchUrl]);

  return { url, error, loading, refresh: fetchUrl };
}