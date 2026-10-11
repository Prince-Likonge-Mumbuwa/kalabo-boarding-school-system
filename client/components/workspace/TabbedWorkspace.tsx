// @/components/workspace/TabbedWorkspace.tsx
//
// One admin destination with several tabs (e.g. Results & SBA). Each tab is
// an existing page, reached by its own URL, so old links and bookmarks still
// open the right tab and Back/Forward move between tabs.
//
//   - The tab shown is the one whose path matches the address.
//   - A tab's page is mounted the first time it is opened and then kept
//     (hidden) while another tab is shown, so filters and half-typed forms
//     survive a tab switch and nothing is loaded twice.
//   - Tabs follow the WAI-ARIA tabs pattern: arrow keys / Home / End move
//     between tabs, Enter or Space opens one.
//   - On narrow screens the tab row scrolls sideways and keeps the selected
//     tab in view; it never wraps or squeezes the labels.

import { Suspense, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Loader2, type LucideIcon } from 'lucide-react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { EmbeddedContext } from './embedded';

export interface WorkspaceTab {
  id: string;
  label: string;
  icon?: LucideIcon;
  /** Address of the tab. The first path is the tab's own; the others also select it. */
  paths: string[];
  /** One line under the tab row describing this tab. */
  description?: string;
  render: () => ReactNode;
}

export interface TabbedWorkspaceProps {
  /** Sidebar item to highlight. */
  navId: string;
  title: string;
  description?: string;
  tabs: WorkspaceTab[];
  /** Extra links/buttons at the right of the title (e.g. a data check). */
  actions?: ReactNode;
}

const normalise = (p: string) => p.replace(/\/+$/, '') || '/';

export function tabForPath(tabs: WorkspaceTab[], pathname: string): WorkspaceTab {
  const path = normalise(pathname);
  return tabs.find(t => t.paths.some(p => normalise(p) === path)) ?? tabs[0];
}

export function TabbedWorkspace({ navId, title, description, tabs, actions }: TabbedWorkspaceProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const active = tabForPath(tabs, location.pathname);
  const baseId = useId();

  // Tabs opened so far stay mounted (hidden) to keep their state.
  const [visited, setVisited] = useState<Set<string>>(() => new Set([active.id]));
  useEffect(() => {
    setVisited(prev => (prev.has(active.id) ? prev : new Set(prev).add(active.id)));
  }, [active.id]);

  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  useEffect(() => {
    tabRefs.current[active.id]?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [active.id]);

  // On narrow screens the tab row scrolls: fade the edge that has more tabs.
  const listRef = useRef<HTMLDivElement | null>(null);
  const [more, setMore] = useState({ left: false, right: false });
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const update = () =>
      setMore({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
    update();
    el.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      el.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [tabs.length]);

  const open = (tab: WorkspaceTab) => {
    if (tab.id !== active.id) navigate(tab.paths[0]);
  };

  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    let next = -1;
    if (e.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    if (next < 0) return;
    e.preventDefault();
    tabRefs.current[tabs[next].id]?.focus();
    open(tabs[next]);
  };

  const tabId = (t: WorkspaceTab) => `${baseId}-tab-${t.id}`;
  const panelId = (t: WorkspaceTab) => `${baseId}-panel-${t.id}`;

  return (
    <DashboardLayout activeTab={navId}>
      {/* Full width: cancel the frame's padding; each tab's page pads itself. */}
      <div className="-m-4 sm:-m-6 lg:-m-8 min-h-full bg-gray-50">
        <div className="bg-white border-b border-gray-200">
          <div className="px-3 sm:px-6 lg:px-8 pt-4 sm:pt-6 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">{title}</h1>
              {description && <p className="text-sm text-gray-600 mt-0.5 max-w-3xl">{description}</p>}
            </div>
            {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
          </div>

          <div className="relative mt-3">
          <div
            ref={listRef}
            role="tablist"
            aria-label={title}
            className="px-3 sm:px-6 lg:px-8 flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden -mb-px"
          >
            {tabs.map((t, i) => {
              const selected = t.id === active.id;
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  ref={el => { tabRefs.current[t.id] = el; }}
                  id={tabId(t)}
                  role="tab"
                  type="button"
                  aria-selected={selected}
                  aria-controls={panelId(t)}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => open(t)}
                  onKeyDown={e => onKeyDown(e, i)}
                  className={`inline-flex items-center gap-2 min-h-[44px] px-3 sm:px-4 text-sm font-medium whitespace-nowrap border-b-2 rounded-t-md
                    focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1
                    ${selected
                      ? 'border-blue-600 text-blue-700'
                      : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'}`}
                >
                  {Icon && <Icon size={16} aria-hidden="true" />}
                  {t.label}
                </button>
              );
            })}
          </div>
          {more.left && <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-white to-transparent" />}
          {more.right && <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-white to-transparent" />}
          </div>
        </div>

        {tabs.map(t => {
          if (!visited.has(t.id) && t.id !== active.id) return null;
          const selected = t.id === active.id;
          return (
            <div
              key={t.id}
              id={panelId(t)}
              role="tabpanel"
              aria-labelledby={tabId(t)}
              hidden={!selected}
            >
              <EmbeddedContext.Provider value={true}>
                <Suspense fallback={<PanelLoading />}>{t.render()}</Suspense>
              </EmbeddedContext.Provider>
            </div>
          );
        })}
      </div>
    </DashboardLayout>
  );
}

function PanelLoading() {
  return (
    <div className="flex items-center justify-center gap-2 text-sm text-gray-600 py-16">
      <Loader2 size={18} className="animate-spin" aria-hidden="true" /> Loading…
    </div>
  );
}
