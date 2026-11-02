import { useCallback, useEffect, useRef, useState } from "react";
import type { TeacherBridge } from "./bridge";
import type { FindingView } from "./types";

/** Subscribes a React shell to the bridge. The state is display data only. */
export function useTeacher(bridge: TeacherBridge | null) {
  const [findings, setFindings] = useState<FindingView[]>([]);
  const [badge, setBadge] = useState(0);
  const [unavailable, setUnavailable] = useState<string[]>([]);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    if (!bridge) return;
    setFindings(bridge.findings());
    setBadge(bridge.badge());
    const off = bridge.subscribe((s) => {
      if (!alive.current) return;
      setFindings(s.findings);
      setBadge(s.badge);
      setUnavailable(s.unavailable);
    });
    return () => { alive.current = false; off(); };
  }, [bridge]);

  const must = findings.filter((f) => f.finding.severity === "must");
  // Optional findings keep their stable order, except those the user keeps dismissing, which go last.
  const optional = [...findings.filter((f) => f.finding.severity === "optional")].sort((a, b) => Number(a.display.demoted) - Number(b.display.demoted));
  const apply = useCallback((key: string) => bridge?.apply(key), [bridge]);
  const dismiss = useCallback((key: string) => bridge?.dismiss(key), [bridge]);
  return { findings, must, optional, badge, unavailable, apply, dismiss };
}
