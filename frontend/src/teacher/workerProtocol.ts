import type { Command, FindingView } from '../../../zenopher-teacher/web/src/teacher/types';

export type TeacherState = { findings: FindingView[]; badge: number; unavailable: string[] };
export interface TeacherRequest {
  id: number;
  method: string;
  args: unknown[];
  snapshot?: string;
  token?: string | null;
}
export type TeacherResponse =
  | { type: 'result'; id: number; value?: unknown; error?: string }
  | { type: 'state'; state: TeacherState }
  | { type: 'commands'; commandId: number; commands: Command[] }
  | { type: 'select'; ids: number[] };
