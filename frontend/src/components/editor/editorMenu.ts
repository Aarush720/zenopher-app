export const EDITOR_MENUS = ['File', 'Edit', 'Image', 'Layer', 'Type', 'Select', 'Filter', 'View', 'Window', 'Help'];

export interface EditorMenuItem {
  id: string;
  label: string;
  path: string[];
  shortcut?: string | null;
  enabled: boolean;
  checked?: boolean | null;
}

export interface EditorMenuResponse {
  ok: boolean;
  error?: string;
  result?: EditorMenuItem[];
  workspace?: string;
  light?: boolean;
}

export interface MenuEntry {
  label: string;
  item?: EditorMenuItem;
  children: MenuEntry[];
}

/** Preserve the native catalogue's ordering and complete submenu hierarchy. */
export function menuTree(items: EditorMenuItem[], path: string[]): MenuEntry[] {
  const entries: MenuEntry[] = [];
  for (const item of items) {
    if (!path.every((part, index) => item.path[index] === part)) continue;
    const group = item.path[path.length];
    if (!group) {
      entries.push({ label: item.label, item, children: [] });
    } else if (!entries.some((entry) => !entry.item && entry.label === group)) {
      entries.push({ label: group, children: menuTree(items, [...path, group]) });
    }
  }
  return entries;
}

export function entryEnabled(entry: MenuEntry): boolean {
  return entry.item ? entry.item.enabled : entry.children.some(entryEnabled);
}

/** Bounded, correlated RPC; replies from an old iframe cannot settle a new request. */
export class EditorMenuClient {
  private sequence = 0;
  private pending = new Map<string, { resolve: (value: EditorMenuResponse) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();

  constructor(private post: (message: object) => void) {}

  request(command?: string): Promise<EditorMenuResponse> {
    const requestId = `menu-${++this.sequence}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(command
          ? 'The editor has not confirmed this command. Check the canvas before trying again.'
          : 'The editor did not respond. Close this menu and try again.'));
      }, command ? 30_000 : 8000);
      this.pending.set(requestId, { resolve, reject, timer });
      try {
        this.post({ source: 'zenopher', type: command ? 'zenopher:menu-invoke' : 'zenopher:menu-list', requestId, command });
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(requestId);
        reject(error);
      }
    });
  }

  receive(requestId: string, response: EditorMenuResponse) {
    const pending = this.pending.get(requestId);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(requestId);
    if (response.ok) pending.resolve(response);
    else pending.reject(new Error(response.error || 'This command is unavailable.'));
  }

  dispose() {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error('The editor was closed.'));
    }
    this.pending.clear();
  }
}
