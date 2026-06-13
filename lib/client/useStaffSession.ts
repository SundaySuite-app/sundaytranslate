"use client";

import { useEffect, useState } from "react";
import type { SessionView } from "@/lib/types";

interface Staff {
  loading: boolean;
  id: string | null;
  session: SessionView | null;
  error: string | null;
}

/** Resolve a PIN to a session id for the staff (source/interpreter) pages. */
export function useStaffSession(pin: string): Staff {
  const [state, setState] = useState<Staff>({
    loading: true,
    id: null,
    session: null,
    error: null,
  });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/sessions/by-pin/${pin}`);
        const data = await res.json();
        if (!alive) return;
        if (!res.ok) {
          setState({ loading: false, id: null, session: null, error: data?.error ?? "not_found" });
          return;
        }
        setState({ loading: false, id: data.session.id, session: data.session, error: null });
      } catch {
        if (alive) setState({ loading: false, id: null, session: null, error: "network" });
      }
    })();
    return () => {
      alive = false;
    };
  }, [pin]);

  return state;
}
