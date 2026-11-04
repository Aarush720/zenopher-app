import type { ApplyAllPlan, Level, TeacherHost } from '../../../zenopher-teacher/web/src/teacher/types';
import type { StyleUnavailable } from '../../../zenopher-teacher/web/src/teacher/catalogSync';
import type { TeacherRequest, TeacherResponse, TeacherState } from './workerProtocol';

/** Keeps the teacher's WASM and rule execution off the canvas/UI thread. */
export class WorkerTeacherBridge {
  private worker: Worker;
  private sequence = 0;
  private pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>();
  private listeners = new Set<(state: TeacherState) => void>();
  private stopped = false;
  private failure: Error | null = null;
  private changeTimer: ReturnType<typeof setTimeout> | null = null;
  private changedIds = new Set<number>();
  private pageChanged = false;
  private snapshotPending = false;

  constructor(private host: TeacherHost, private api: string, private consent: boolean) {
    this.worker = new Worker(new URL('./teacher.worker.ts', import.meta.url), { type: 'module', name: 'zenopher-teacher' });
    this.worker.onmessage = (event: MessageEvent<TeacherResponse>) => {
      if (this.stopped) return;
      const message = event.data;
      if (message.type === 'state') this.listeners.forEach((listener) => listener(message.state));
      else if (message.type === 'commands') void this.runCommands(message.commandId, message.commands);
      else if (message.type === 'select') this.host.selectLayers(message.ids);
      else {
        const pending = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) pending?.reject(new Error(message.error));
        else pending?.resolve(message.value);
      }
    };
    this.worker.onerror = (event) => {
      this.failure = new Error(event.message || 'The teacher worker could not load.');
      for (const pending of this.pending.values()) pending.reject(this.failure);
      this.pending.clear();
    };
  }

  private async runCommands(id: number, commands: Parameters<TeacherHost['runCommands']>[0]): Promise<void> {
    let error: string | undefined;
    try { await this.host.runCommands(commands); }
    catch (reason) { error = reason instanceof Error ? reason.message : String(reason); }
    this.flushChanges(true);
    this.send('commandsDone', [id, error]);
  }

  private call<T = void>(method: string, args: unknown[] = [], snapshot?: string): Promise<T> {
    if (this.stopped || this.failure) return Promise.reject(this.failure ?? new Error('The teacher was closed.'));
    const id = ++this.sequence;
    let token: string | null = null;
    try { token = sessionStorage.getItem('zenopher_access_token'); } catch { /* storage can be disabled */ }
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: (value) => resolve(value as T), reject });
      const request: TeacherRequest = { id, method, args, snapshot, token };
      try { this.worker.postMessage(request); }
      catch (error) { this.pending.delete(id); reject(error); }
    });
  }

  // Notifications are fire-and-forget; action/start errors are returned to the UI.
  private send(method: string, args: unknown[] = [], snapshot?: string): void {
    void this.call(method, args, snapshot).catch(() => {});
  }

  async start(): Promise<void> {
    await this.call('start', [this.api, this.consent], this.host.snapshotJson());
    if (this.stopped) return;
    document.addEventListener('visibilitychange', this.visibilityChanged);
    window.addEventListener('online', this.online);
    if (document.hidden) this.visibilityChanged();
  }

  stop(): void {
    this.stopped = true;
    if (this.changeTimer !== null) clearTimeout(this.changeTimer);
    this.changeTimer = null;
    this.changedIds.clear();
    this.worker.terminate();
    document.removeEventListener('visibilitychange', this.visibilityChanged);
    window.removeEventListener('online', this.online);
    for (const pending of this.pending.values()) pending.reject(new Error('The teacher was closed.'));
    this.pending.clear();
    this.listeners.clear();
  }

  private visibilityChanged = () => {
    if (!document.hidden) this.flushChanges();
    this.send(document.hidden ? 'pause' : 'resume');
  };
  private online = () => { this.send('flush'); };
  subscribe(listener: (state: TeacherState) => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  setLevel(level: Level): void { this.send('setLevel', [level]); }
  setStyle(style: { id: string; version: number } | null): Promise<{ ok: true } | { ok: false; reason: StyleUnavailable }> { return this.call('setStyle', [style]); }
  onChange(ids: number[], pageChanged = false): void {
    for (const id of ids) this.changedIds.add(id);
    this.pageChanged ||= pageChanged;
    this.snapshotPending = true;
    if (this.changeTimer === null) this.changeTimer = setTimeout(() => this.flushChanges(), 50);
  }
  private flushChanges(forAction = false): void {
    if (this.changeTimer !== null) clearTimeout(this.changeTimer);
    this.changeTimer = null;
    if (!this.snapshotPending || this.stopped || (document.hidden && !forAction)) return;
    this.send('onChange', [[...this.changedIds], this.pageChanged], this.host.snapshotJson());
    this.changedIds.clear();
    this.pageChanged = false;
    this.snapshotPending = false;
  }
  gestureStart(): void { this.send('gestureStart'); }
  gestureEnd(): void { this.flushChanges(); this.send('gestureEnd'); }
  setConsent(consent: boolean): Promise<void> { return this.call('setConsent', [consent]); }
  apply(key: string): Promise<void> { this.flushChanges(true); return this.call('apply', [key]); }
  planApplyAll(): Promise<ApplyAllPlan> { this.flushChanges(true); return this.call('planApplyAll'); }
  commitApplyAll(plan: ApplyAllPlan): Promise<void> { this.flushChanges(true); return this.call('commitApplyAll', [plan]); }
  onUndo(): Promise<void> { return this.call('onUndo'); }
}
