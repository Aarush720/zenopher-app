// Spec 8.8. Only these fields can be logged, by construction. Tokens, cookies, magic links, full emails, design content,
// uploads and critique images or text have no field to go in.
export interface LogLine {
  request_id: string;
  route: string;
  status: number;
  latency_ms: number;
  user_id?: string;
  error_code?: string;
}
export function logRequest(line: LogLine): void { console.log(JSON.stringify({ level: "info", ...line })); }
/** Stack traces are logged here and never returned. */
export function logError(request_id: string, route: string, err: unknown): void {
  const e = err instanceof Error ? err : new Error(String(err));
  console.error(JSON.stringify({ level: "error", request_id, route, error: e.name, stack: e.stack }));
}
