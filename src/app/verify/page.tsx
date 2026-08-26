"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useSignedUrl } from "@/lib/useSignedUrl";
import ClipPlayer from "@/components/ClipPlayer";

function VerifyInner() {
  const params = useSearchParams();
  const clipId = params.get("clip");
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);

  const supabase = createClient();
  const { url, error, loading } = useSignedUrl(
    signedIn ? clipId : null,
    "video",
  );

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSignedIn(!!data.session);
    });
  }, [supabase]);

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) setAuthError(error.message);
    else setSignedIn(true);
  };

  if (signedIn === null) {
    return <p className="p-8 text-center text-gray-500">loading...</p>;
  }

  if (!signedIn) {
    return (
      <form onSubmit={signIn} className="max-w-sm mx-auto p-8 space-y-3">
        <h1 className="text-lg font-bold">Sign in</h1>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email"
          autoComplete="username"
          className="w-full border rounded px-3 py-2"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="password"
          autoComplete="current-password"
          className="w-full border rounded px-3 py-2"
        />
        <button className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold">
          Sign in
        </button>
        {authError && <p className="text-red-600 text-sm">{authError}</p>}
      </form>
    );
  }

  if (!clipId) {
    return (
      <p className="p-8 text-center text-gray-500">
        URLパラメータに ?clip=&lt;uuid&gt; を指定してください
      </p>
    );
  }

  return (
    <main className="p-4 space-y-4">
      <h1 className="text-center text-sm text-gray-500 font-mono break-all">
        {clipId}
      </h1>
      {loading && <p className="text-center">署名URL取得中...</p>}
      {error && (
        <p className="text-center text-red-600 text-sm">error: {error}</p>
      )}
      {url && <ClipPlayer src={url} />}
    </main>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={<p className="p-8 text-center">loading...</p>}>
      <VerifyInner />
    </Suspense>
  );
}