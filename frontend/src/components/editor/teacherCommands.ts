import type { Design } from '../../types';
import type { Command } from '../../../../zenopher-teacher/web/src/teacher/types';

type CanvasCommand = Omit<Command, 'layer'> & { layer: string; from?: { x: number; y: number; w: number; h: number } };
export type RunTeacherCommands = (commands: Command[], ids: ReadonlyMap<number, string>) => Promise<Partial<Design>>;

export function canvasCommands(design: Design, commands: Command[], ids: ReadonlyMap<number, string>): CanvasCommand[] {
  const layers = new Map(design.layers.map(layer => [layer.id, layer]));
  return commands.map(command => {
    const id = ids.get(command.layer);
    const layer = id ? layers.get(id) : undefined;
    if (!id || !layer) throw new Error('The layer changed. Wait for the current review.');
    return { ...command, layer: id, ...(command.type === 'set_bounds' ? { from: { x: layer.x, y: layer.y, w: layer.width, h: layer.height } } : {}) };
  });
}

/** Correlates fixes with the live editor's acknowledgement, never an optimistic React copy. */
export class CanvasTeacherClient {
  private sequence = 0;
  private pending = new Map<string, { resolve(design: Partial<Design>): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>();
  constructor(private post: (message: unknown) => void) {}
  run(design: Design, commands: Command[], ids: ReadonlyMap<number, string>): Promise<Partial<Design>> {
    if (design.editorRevision === undefined) return Promise.reject(new Error('Wait for the canvas to finish syncing before applying fixes.'));
    const mapped = canvasCommands(design, commands, ids);
    const requestId = `teacher-${++this.sequence}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(requestId); reject(new Error('The canvas did not confirm the fix.')); }, 15_000);
      this.pending.set(requestId, { resolve, reject, timer });
      try { this.post({ source: 'zenopher', type: 'zenopher:teacher-fix', requestId, revision: design.editorRevision, commands: mapped }); }
      catch (error) { clearTimeout(timer); this.pending.delete(requestId); reject(error); }
    });
  }
  receive(requestId: string, response: { ok?: boolean; design?: Partial<Design>; error?: string }): void {
    const pending = this.pending.get(requestId);
    if (!pending) return;
    clearTimeout(pending.timer); this.pending.delete(requestId);
    if (response.ok && response.design) {
      const design = response.design;
      pending.resolve(Object.fromEntries((['width', 'height', 'background', 'layers', 'editorRevision'] as const).filter(key => design[key] !== undefined).map(key => [key, design[key]])));
    }
    else pending.reject(new Error(response.error || 'The canvas could not apply this fix.'));
  }
  dispose(): void {
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error('The editor was closed.')); }
    this.pending.clear();
  }
}
