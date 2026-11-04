import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, ChevronLeft, ChevronRight, Moon, Search, Sun } from 'lucide-react';
import PillNav from '../PillNav';
import { EDITOR_MENUS, EditorMenuResponse, MenuEntry, entryEnabled, menuTree } from './editorMenu';
import './EditorMenuBar.css';

interface Props {
  title: string;
  enabled: boolean;
  request: (command?: string) => Promise<EditorMenuResponse>;
  focusCanvas: () => void;
}

export function EditorMenuBar({ title, enabled, request, focusCanvas }: Props) {
  const id = useId();
  const header = useRef<HTMLElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const generation = useRef(0);
  const [open, setOpen] = useState<string | null>(null);
  const [path, setPath] = useState<string[]>([]);
  const [entries, setEntries] = useState<MenuEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [workspace, setWorkspace] = useState('Essentials');
  const [light, setLight] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 12 });

  const close = (restore = false) => {
    generation.current++;
    setOpen(null);
    setLoading(false);
    if (restore) trigger.current?.focus();
  };
  const remember = (response: EditorMenuResponse) => {
    if (response.workspace) setWorkspace(response.workspace);
    if (response.light !== undefined) setLight(response.light);
  };

  useEffect(() => {
    if (!enabled) { close(); return; }
    let active = true;
    request().then((response) => { if (active) remember(response); }).catch(() => {});
    return () => { active = false; generation.current++; };
  }, [enabled, request]);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!header.current?.contains(event.target as Node) && !panel.current?.contains(event.target as Node)) close();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close(true); }
    };
    const blur = () => close(); // A click inside the iframe leaves the parent document.
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    window.addEventListener('blur', blur);
    window.addEventListener('resize', blur);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', escape);
      window.removeEventListener('blur', blur);
      window.removeEventListener('resize', blur);
    };
  }, [open]);

  useEffect(() => {
    if (open && !loading) panel.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }, [open, loading, path]);

  async function show(name: string, element: HTMLElement) {
    if (open === name) { close(); return; }
    trigger.current = element;
    const rect = header.current?.getBoundingClientRect();
    setPosition({ top: (rect?.bottom ?? 50) + 6, left: Math.max(12, Math.min(element.getBoundingClientRect().left, window.innerWidth - 332)) });
    setOpen(name);
    setPath([]);
    setEntries([]);
    setLoading(true);
    setError('');
    const current = ++generation.current;
    try {
      const response = await request();
      if (current !== generation.current) return;
      remember(response);
      const items = response.result ?? [];
      setEntries(name === 'Workspace'
        ? items.filter((item) => item.id.startsWith('window.workspace.')).map((item) => ({ label: item.label, item, children: [] }))
        : menuTree(items, [name]));
    } catch (error) {
      if (current === generation.current) setError(error instanceof Error ? error.message : 'Could not open this menu.');
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }

  async function invoke(command: string) {
    close();
    setError('');
    try { remember(await request(command)); focusCanvas(); }
    catch (error) { setError(error instanceof Error ? error.message : 'Could not run this command.'); }
  }

  let visible = entries;
  for (const part of path) visible = visible.find((entry) => entry.label === part)?.children ?? [];

  return <>
    <header ref={header} className="editor-menu-bar" data-light={light || undefined} aria-label="Editor menu bar">
      <div className="editor-menu-navigation" onKeyDown={(event) => {
        if (event.key === 'ArrowDown' && event.target instanceof HTMLButtonElement && event.target.textContent) {
          const name = EDITOR_MENUS.find((name) => event.target instanceof HTMLElement && event.target.textContent?.startsWith(name));
          if (name) {
            event.preventDefault();
            if (open === name) panel.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
            else void show(name, event.target);
          }
        }
      }}>
        <PillNav className="editor-pill-nav" items={EDITOR_MENUS.map((label) => ({
          label, disabled: !enabled, ariaHasPopup: 'menu', expanded: open === label, controls: open === label ? id : undefined,
        }))} activeHref="" layout="joined" itemStyle="plain" hoverEffect="fill" indicator="none"
          surface="none" size="sm" collapse="never" theme={light ? 'light' : 'dark'} intro={false} bounce={0} stretch={0}
          highlightColor={light ? '#dedede' : '#292929'} highlightTextColor={light ? '#151515' : '#f5f5f5'}
          textColor={light ? '#454545' : '#b8b8b8'} ariaLabel="PhotoCraft menus"
          onItemClick={(item, _index, event) => { void show(item.label, event.currentTarget); }} />
      </div>
      <div className="editor-menu-title" title={title}><span className="editor-menu-title-text">{title}</span><span aria-label="Document open" className="editor-document-dot" /></div>
      <div className="editor-menu-utilities">
        <button type="button" className="editor-menu-icon" disabled={!enabled} onClick={() => void invoke('window.theme.toggle')} aria-label="Cycle editor appearance" title="Cycle editor appearance">
          {light ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        <button type="button" className="editor-menu-icon" disabled={!enabled} onClick={() => void invoke('edit.search')} aria-label="Search editor commands" title="Search editor commands"><Search size={18} /></button>
        <button type="button" className="editor-workspace-picker" disabled={!enabled} aria-haspopup="menu" aria-expanded={open === 'Workspace'} aria-controls={open === 'Workspace' ? id : undefined}
          onClick={(event) => void show('Workspace', event.currentTarget)} title="Editor workspace"><span>{workspace}</span><ChevronDown size={15} /></button>
      </div>
    </header>
    {error && !open && <div className="editor-menu-error" role="alert">{error}<button type="button" aria-label="Dismiss menu error" onClick={() => setError('')}>×</button></div>}
    {open && createPortal(<div ref={panel} id={id} className="editor-menu-dropdown" data-light={light || undefined} role="menu" aria-label={[open, ...path].join(' / ')} aria-busy={loading}
      style={{ top: position.top, left: position.left, maxHeight: `max(100px, calc(100dvh - ${position.top + 12}px))` }}
      onKeyDown={(event) => {
        const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
          event.preventDefault();
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
          buttons[next]?.focus();
        } else if (event.key === 'ArrowLeft' && path.length) {
          event.preventDefault(); setPath(path.slice(0, -1));
        } else if (event.key === 'ArrowRight' && document.activeElement?.getAttribute('aria-haspopup') === 'menu') {
          event.preventDefault(); (document.activeElement as HTMLButtonElement).click();
        } else if (event.key === 'Tab') close();
      }}>
      {path.length > 0 && <button type="button" role="menuitem" className="editor-menu-back" onClick={() => setPath(path.slice(0, -1))}><ChevronLeft size={15} />{path[path.length - 1]}</button>}
      {loading ? <div className="editor-menu-notice" role="status">Loading menu…</div> : error ? <div className="editor-menu-notice" role="alert">{error}</div> : visible.map((entry, index) => entry.item?.id === '---'
        ? <hr key={`separator-${index}`} role="separator" /> : <button
        type="button" key={entry.item?.id ?? entry.label} role={entry.item?.checked != null ? 'menuitemcheckbox' : 'menuitem'} aria-checked={entry.item?.checked ?? undefined}
        disabled={!entryEnabled(entry)} aria-haspopup={entry.children.length ? 'menu' : undefined} onClick={() => entry.item ? void invoke(entry.item.id) : setPath([...path, entry.label])}>
        <span className="editor-menu-check">{entry.item?.checked && <Check size={14} />}</span><span className="editor-menu-label">{entry.label}</span>
        {entry.children.length ? <ChevronRight size={14} /> : entry.item?.shortcut ? <kbd>{entry.item.shortcut}</kbd> : null}
      </button>)}
    </div>, document.body)}
  </>;
}
