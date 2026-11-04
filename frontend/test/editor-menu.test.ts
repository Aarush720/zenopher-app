import { describe, expect, it, vi } from 'vitest';
import { EditorMenuClient, EditorMenuItem, entryEnabled, menuTree } from '../src/components/editor/editorMenu';

const items: EditorMenuItem[] = [
  { id: 'file.new', label: 'New…', path: ['File'], enabled: true },
  { id: 'file.export.png', label: 'PNG', path: ['File', 'Export'], enabled: true },
  { id: 'file.export.psd', label: 'PSD', path: ['File', 'Export'], enabled: false },
  { id: 'image.mode.rgb', label: 'RGB', path: ['Image', 'Mode'], enabled: true, checked: true },
];

describe('editor menus', () => {
  it('preserves native order, submenu hierarchy, checked and disabled states', () => {
    const tree = menuTree(items, ['File']);
    expect(tree.map((entry) => entry.label)).toEqual(['New…', 'Export']);
    expect(tree[1].children.map((entry) => entry.item?.id)).toEqual(['file.export.png', 'file.export.psd']);
    expect(entryEnabled(tree[1])).toBe(true);
    expect(entryEnabled(tree[1].children[1])).toBe(false);
    expect(menuTree(items, ['Image'])[0].children[0].item?.checked).toBe(true);
    expect(menuTree(items, ['Help'])).toEqual([]);
  });

  it('correlates overlapping requests and propagates native errors', async () => {
    const sent: { requestId: string; command?: string; type: string }[] = [];
    const client = new EditorMenuClient((message) => sent.push(message as typeof sent[number]));
    const list = client.request();
    const invoke = client.request('edit.undo');
    const failed = expect(invoke).rejects.toThrow('Disabled');
    expect(sent.map((message) => message.type)).toEqual(['zenopher:menu-list', 'zenopher:menu-invoke']);
    client.receive(sent[1].requestId, { ok: false, error: 'Disabled' });
    client.receive('unrelated', { ok: true });
    client.receive(sent[0].requestId, { ok: true, result: items });
    await failed;
    expect((await list).result).toEqual(items);
    client.dispose();
  });

  it('expires missing replies and cancels requests when the iframe closes', async () => {
    vi.useFakeTimers();
    try {
      const client = new EditorMenuClient(() => {});
      const first = expect(client.request()).rejects.toThrow('did not respond');
      await vi.advanceTimersByTimeAsync(8000);
      await first;
      const second = expect(client.request()).rejects.toThrow('closed');
      client.dispose();
      await second;
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });
});
