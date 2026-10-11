// @vitest-environment jsdom
// The tabbed workspace: tabs are addresses, keyboard works, and a tab keeps
// its state when you switch away and back.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React, { useState } from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom';

vi.mock('@/components/DashboardLayout', () => ({
  DashboardLayout: ({ children, activeTab }: any) => <div data-nav={activeTab}>{children}</div>,
}));

import { TabbedWorkspace, tabForPath, type WorkspaceTab } from './TabbedWorkspace';
import { useEmbedded } from './embedded';

const mounts: Record<string, number> = {};
function Counter({ name }: { name: string }) {
  const [n, setN] = useState(0);
  const embedded = useEmbedded();
  React.useEffect(() => { mounts[name] = (mounts[name] ?? 0) + 1; }, [name]);
  return (
    <div>
      <p>{name} count {n} {embedded ? 'embedded' : 'standalone'}</p>
      <button onClick={() => setN(n + 1)}>add {name}</button>
    </div>
  );
}

const tabs: WorkspaceTab[] = [
  { id: 'a', label: 'Alpha', paths: ['/w/a'], render: () => <Counter name="alpha" /> },
  { id: 'b', label: 'Beta', paths: ['/w/b', '/old/beta'], render: () => <Counter name="beta" /> },
  { id: 'c', label: 'Gamma', paths: ['/w/c'], render: () => <Counter name="gamma" /> },
];

let nav: (to: any) => void = () => {};
function Where() {
  const loc = useLocation();
  nav = useNavigate();
  return <output data-testid="path">{loc.pathname}</output>;
}

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<><TabbedWorkspace navId="ws" title="Workspace" tabs={tabs} /><Where /></>}>
          {['/w/a', '/w/b', '/w/c', '/old/beta'].map(p => <Route key={p} path={p} element={null} />)}
        </Route>
      </Routes>
    </MemoryRouter>
  );

beforeEach(() => {
  cleanup();
  for (const k of Object.keys(mounts)) delete mounts[k];
});

describe('TabbedWorkspace', () => {
  it('opens the tab of the address, including an old address', () => {
    renderAt('/old/beta');
    expect(screen.getByRole('tab', { name: 'Beta' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: 'Alpha' }).getAttribute('aria-selected')).toBe('false');
    expect(screen.getByText(/beta count 0 embedded/)).toBeTruthy();
    // Only the open tab is mounted.
    expect(screen.queryByText(/alpha count/)).toBeNull();
    expect(screen.getByRole('tabpanel').getAttribute('aria-labelledby')).toBe(screen.getByRole('tab', { name: 'Beta' }).id);
  });

  it('switching tabs changes the address and keeps each tab’s state', () => {
    renderAt('/w/a');
    fireEvent.click(screen.getByText('add alpha'));
    fireEvent.click(screen.getByText('add alpha'));
    expect(screen.getByText(/alpha count 2/)).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: 'Gamma' }));
    expect(screen.getByTestId('path').textContent).toBe('/w/c');
    expect(screen.getByText(/gamma count 0/)).toBeTruthy();
    // Alpha is hidden, not thrown away.
    expect(screen.getByText(/alpha count 2/).closest('[role="tabpanel"]')!.hasAttribute('hidden')).toBe(true);

    fireEvent.click(screen.getByRole('tab', { name: 'Alpha' }));
    expect(screen.getByText(/alpha count 2/)).toBeTruthy();
    expect(mounts.alpha).toBe(1); // never remounted
    expect(mounts.gamma).toBe(1);
  });

  it('Back and Forward move between tabs', () => {
    renderAt('/w/a');
    fireEvent.click(screen.getByRole('tab', { name: 'Beta' }));
    expect(screen.getByRole('tab', { name: 'Beta' }).getAttribute('aria-selected')).toBe('true');
    React.act(() => nav(-1));
    expect(screen.getByTestId('path').textContent).toBe('/w/a');
    expect(screen.getByRole('tab', { name: 'Alpha' }).getAttribute('aria-selected')).toBe('true');
    React.act(() => nav(1));
    expect(screen.getByRole('tab', { name: 'Beta' }).getAttribute('aria-selected')).toBe('true');
  });

  it('keyboard: arrows, Home and End move and open tabs; only the selected tab is in the tab order', () => {
    renderAt('/w/a');
    const alpha = screen.getByRole('tab', { name: 'Alpha' });
    expect(alpha.tabIndex).toBe(0);
    expect(screen.getByRole('tab', { name: 'Beta' }).tabIndex).toBe(-1);

    fireEvent.keyDown(alpha, { key: 'ArrowRight' });
    expect(screen.getByTestId('path').textContent).toBe('/w/b');
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Beta' }));

    fireEvent.keyDown(screen.getByRole('tab', { name: 'Beta' }), { key: 'End' });
    expect(screen.getByTestId('path').textContent).toBe('/w/c');

    fireEvent.keyDown(screen.getByRole('tab', { name: 'Gamma' }), { key: 'ArrowRight' });
    expect(screen.getByTestId('path').textContent).toBe('/w/a'); // wraps

    fireEvent.keyDown(screen.getByRole('tab', { name: 'Alpha' }), { key: 'ArrowLeft' });
    expect(screen.getByTestId('path').textContent).toBe('/w/c');

    fireEvent.keyDown(screen.getByRole('tab', { name: 'Gamma' }), { key: 'Home' });
    expect(screen.getByTestId('path').textContent).toBe('/w/a');
  });

  it('highlights its sidebar item and falls back to the first tab', () => {
    const { container } = renderAt('/w/a');
    expect(container.querySelector('[data-nav="ws"]')).toBeTruthy();
    expect(tabForPath(tabs, '/unknown').id).toBe('a');
    expect(tabForPath(tabs, '/w/c/').id).toBe('c');
  });
});
