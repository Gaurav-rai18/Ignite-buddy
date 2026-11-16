import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { LayoutDashboard } from 'lucide-react';
import { EmptyState } from '../components/ui/EmptyState';
import { PageIntro } from '../components/ui/PageIntro';
import { StatCard } from '../components/ui/StatCard';
import { Toast } from '../components/ui/Toast';
import { Pager } from '../components/ui/Pager';
import { Field } from '../components/ui/Field';
import { Sidebar } from '../components/layout/Sidebar';
import { Topbar } from '../components/layout/Topbar';
import { Footer } from '../components/layout/Footer';
import { AppLayout } from '../components/layout/AppLayout';
import { ProtectedRoute } from '../components/layout/ProtectedRoute';

// AppLayout and ProtectedRoute both read auth from the useAuth hook. We mock the
// hook so we can deterministically drive authenticated / unauthenticated /
// loading branches without spinning up the real AuthProvider.
const authMock = vi.hoisted(() => ({
  state: {
    user: {
      full_name: 'Admin User',
      email: 'admin@campus.demo',
      role: 'ADMIN',
      is_superuser: false,
      profile_picture: '',
    },
    isAuthenticated: true,
    loading: false,
    logout: vi.fn(),
  },
}));

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => authMock.state,
}));

const adminUser = {
  full_name: 'Admin User',
  email: 'admin@campus.demo',
  role: 'ADMIN',
  is_superuser: false,
};

beforeEach(() => {
  authMock.state.user = { ...adminUser, profile_picture: '' };
  authMock.state.isAuthenticated = true;
  authMock.state.loading = false;
  authMock.state.logout = vi.fn();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('EmptyState', () => {
  it('renders the title and body text and no action button when no action is supplied', () => {
    render(<EmptyState icon={LayoutDashboard} title="No announcements yet" text="Create your first broadcast." />);

    expect(screen.getByText('No announcements yet')).toBeInTheDocument();
    expect(screen.getByText('Create your first broadcast.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders an action button only when both action and onClick are provided', () => {
    render(
      <EmptyState
        icon={LayoutDashboard}
        title="Nothing here"
        text="Try creating an item."
        action="Create item"
        onClick={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: /create item/i })).toBeInTheDocument();
  });

  it('does NOT render the action button when action is set but onClick is missing', () => {
    render(<EmptyState icon={LayoutDashboard} title="Nothing here" text="No-op." action="Create item" />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('fires onClick when the action button is clicked', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();

    render(
      <EmptyState
        icon={LayoutDashboard}
        title="Nothing here"
        text="Try creating an item."
        action="Create item"
        onClick={handleClick}
      />
    );

    await user.click(screen.getByRole('button', { name: /create item/i }));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});

describe('PageIntro', () => {
  it('renders eyebrow, title heading and subtitle', () => {
    render(<PageIntro eyebrow="Admin Console" title="Broadcast" subtitle="Send announcements to the campus." />);

    expect(screen.getByText('Admin Console')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Broadcast' })).toBeInTheDocument();
    expect(screen.getByText('Send announcements to the campus.')).toBeInTheDocument();
  });

  it('renders gracefully when optional values are undefined', () => {
    render(<PageIntro title="Reports" />);

    expect(screen.getByRole('heading', { level: 1, name: 'Reports' })).toBeInTheDocument();
  });
});

describe('StatCard', () => {
  it('renders as a non-interactive element when no onClick is provided', () => {
    const { container } = render(
      <StatCard icon={LayoutDashboard} label="Active users" value="128" note="+12 this week" />
    );

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('Active users')).toBeInTheDocument();
    expect(screen.getByText('128')).toBeInTheDocument();
    expect(screen.getByText('+12 this week')).toBeInTheDocument();
    expect(container.querySelector('.stat-card')).not.toHaveClass('clickable');
  });

  it('renders as a clickable button and invokes onClick', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    const { container } = render(
      <StatCard icon={LayoutDashboard} tone="danger" label="Open incidents" value="4" note="Needs attention" onClick={handleClick} />
    );

    const card = screen.getByRole('button');
    expect(card).toHaveClass('stat-card', 'clickable');
    expect(container.querySelector('.stat-icon.danger')).not.toBeNull();

    await user.click(card);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('applies the requested tone class to the icon wrapper', () => {
    const { container } = render(<StatCard icon={LayoutDashboard} tone="success" label="Passed" value="90%" note="All good" />);

    expect(container.querySelector('.stat-icon.success')).not.toBeNull();
  });
});

describe('Toast', () => {
  it('renders nothing when the message is empty', () => {
    const { container } = render(<Toast message="" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the message with a polite status role', () => {
    render(<Toast message="Broadcast saved." />);

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Broadcast saved.');
    expect(status).toHaveAttribute('aria-live', 'polite');
  });
});

describe('Pager', () => {
  it('renders nothing when there are no items', () => {
    const { container } = render(<Pager totalItems={0} onPageChange={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows the item range summary', () => {
    render(<Pager currentPage={1} totalPages={3} totalItems={40} pageSize={15} onPageChange={vi.fn()} />);

    expect(screen.getByRole('navigation', { name: /pagination navigation/i })).toHaveTextContent(
      'Showing 1 to 15 of 40 items'
    );
  });

  it('disables first/previous on page 1 and drives next/last navigation', async () => {
    const user = userEvent.setup();
    const handlePageChange = vi.fn();

    render(<Pager currentPage={1} totalPages={3} totalItems={40} pageSize={15} onPageChange={handlePageChange} />);

    expect(screen.getByRole('button', { name: 'First page' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next page' })).not.toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Next page' }));
    expect(handlePageChange).toHaveBeenCalledWith(2);

    await user.click(screen.getByRole('button', { name: 'Last page' }));
    expect(handlePageChange).toHaveBeenCalledWith(3);
  });

  it('marks the current page button and signals selection on click', async () => {
    const user = userEvent.setup();
    const handlePageChange = vi.fn();

    render(<Pager currentPage={2} totalPages={3} totalItems={40} pageSize={15} onPageChange={handlePageChange} />);

    expect(screen.getByRole('button', { name: '2' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: '1' })).not.toHaveAttribute('aria-current');

    await user.click(screen.getByRole('button', { name: '3' }));
    expect(handlePageChange).toHaveBeenCalledWith(3);
  });

  it('renders a page-size selector and reports numeric changes', async () => {
    const user = userEvent.setup();
    const handlePageSizeChange = vi.fn();

    render(
      <Pager
        currentPage={1}
        totalPages={3}
        totalItems={40}
        pageSize={15}
        onPageChange={vi.fn()}
        onPageSizeChange={handlePageSizeChange}
      />
    );

    const select = screen.getByLabelText('Per page:');
    await user.selectOptions(select, '25');
    expect(handlePageSizeChange).toHaveBeenCalledWith(25);
  });

  it('omits the page-size selector when onPageSizeChange is not given', () => {
    render(<Pager currentPage={1} totalPages={3} totalItems={40} pageSize={15} onPageChange={vi.fn()} />);

    expect(screen.queryByLabelText('Per page:')).not.toBeInTheDocument();
  });

  it('renders ellipsis placeholders when there are many pages', () => {
    const { container } = render(
      <Pager currentPage={1} totalPages={10} totalItems={100} pageSize={10} onPageChange={vi.fn()} />
    );

    expect(container.querySelectorAll('.pager-ellipsis-span').length).toBeGreaterThan(0);
  });

  it('jumps to a valid page via the Go field and ignores out-of-range input', () => {
    const handlePageChange = vi.fn();

    render(<Pager currentPage={1} totalPages={10} totalItems={100} pageSize={10} onPageChange={handlePageChange} />);

    const jumpInput = screen.getByLabelText('Go:');

    fireEvent.change(jumpInput, { target: { value: '4' } });
    fireEvent.submit(jumpInput.closest('form'));
    expect(handlePageChange).toHaveBeenCalledWith(4);

    handlePageChange.mockClear();
    fireEvent.change(jumpInput, { target: { value: '99' } });
    fireEvent.submit(jumpInput.closest('form'));
    expect(handlePageChange).not.toHaveBeenCalled();
  });
});

describe('Field', () => {
  it('renders the label, control and help text', () => {
    render(
      <Field label="Email" htmlFor="email-input" helpText="Use your campus address">
        <input id="email-input" />
      </Field>
    );

    expect(screen.getByText('Email')).toBeInTheDocument();
    expect(screen.getByText('Use your campus address')).toBeInTheDocument();
    // helpText is rendered inside the <label>, so the accessible label name is
    // "EmailUse your campus address" - match on a substring instead.
    expect(screen.getByLabelText(/Email/)).toBe(screen.getByRole('textbox'));
  });

  it('renders an inline validation error with an alert role', () => {
    render(
      <Field label="Email" htmlFor="email-input" error="Email is required.">
        <input id="email-input" />
      </Field>
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Email is required.');
  });

  it('does not render help text or error when omitted', () => {
    render(
      <Field label="Email" htmlFor="email-input">
        <input id="email-input" />
      </Field>
    );

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText('Use your campus address')).not.toBeInTheDocument();
  });
});

describe('Sidebar', () => {
  const renderSidebar = (props = {}, { route = '/dashboard' } = {}) =>
    render(
      <MemoryRouter initialEntries={[route]}>
        <Sidebar user={adminUser} onSignOut={vi.fn()} {...props} />
      </MemoryRouter>
    );

  it('renders every navigation item as a link pointing at its route', () => {
    renderSidebar();

    const nav = screen.getByRole('navigation', { name: /main menu/i });
    expect(within(nav).getByRole('link', { name: /dashboard/i })).toHaveAttribute('href', '/dashboard');
    expect(within(nav).getByRole('link', { name: /broadcast/i })).toHaveAttribute('href', '/broadcast');
    expect(within(nav).getByRole('link', { name: /buddy control/i })).toHaveAttribute('href', '/buddy');
    expect(within(nav).getByRole('link', { name: /manage users/i })).toHaveAttribute('href', '/users');
    expect(within(nav).getAllByRole('link')).toHaveLength(7);
  });

  it('highlights the active route link', () => {
    renderSidebar({}, { route: '/broadcast' });

    expect(screen.getByRole('link', { name: /broadcast/i })).toHaveClass('active');
    expect(screen.getByRole('link', { name: /dashboard/i })).not.toHaveClass('active');
  });

  it('calls onCloseMobileNav when a navigation link is clicked', async () => {
    const user = userEvent.setup();
    const handleClose = vi.fn();
    renderSidebar({ onCloseMobileNav: handleClose });

    await user.click(screen.getByRole('link', { name: /manage users/i }));
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('shows a dismissible overlay and closes on scrim click when the mobile nav is open', async () => {
    const user = userEvent.setup();
    const handleClose = vi.fn();
    renderSidebar({ mobileNav: true, onCloseMobileNav: handleClose });

    expect(screen.getByRole('complementary')).toHaveClass('sidebar-open');

    await user.click(screen.getByRole('button', { name: /close navigation overlay/i }));
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('closes the mobile nav via the close button and the Escape key', async () => {
    const user = userEvent.setup();
    const handleClose = vi.fn();
    renderSidebar({ mobileNav: true, onCloseMobileNav: handleClose });

    await user.click(screen.getByRole('button', { name: /close navigation menu/i }));
    expect(handleClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(handleClose).toHaveBeenCalledTimes(2);
  });

  it('ignores the Escape key when the mobile nav is closed', () => {
    const handleClose = vi.fn();
    renderSidebar({ mobileNav: false, onCloseMobileNav: handleClose });

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(handleClose).not.toHaveBeenCalled();
  });

  it('opens the profile menu and signs out from it', async () => {
    const user = userEvent.setup();
    const handleSignOut = vi.fn();
    renderSidebar({ onSignOut: handleSignOut });

    const profileButton = screen.getByRole('button', { name: /toggle user profile options/i });
    expect(profileButton).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    await user.click(profileButton);
    expect(profileButton).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menu', { name: /user profile menu/i })).toBeInTheDocument();

    await user.click(screen.getByRole('menuitem', { name: /sign out/i }));
    expect(handleSignOut).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});

describe('Topbar', () => {
  const renderTopbar = (props = {}) =>
    render(
      <MemoryRouter>
        <Topbar pageTitle="Dashboard" user={adminUser} onSignOut={vi.fn()} {...props} />
      </MemoryRouter>
    );

  it('renders the current page title in the breadcrumb', () => {
    renderTopbar({ pageTitle: 'Buddy Control' });

    expect(within(screen.getByLabelText('Breadcrumb')).getByText('Buddy Control')).toBeInTheDocument();
  });

  it('invokes onOpenMobileNav from the menu toggle', async () => {
    const user = userEvent.setup();
    const handleOpen = vi.fn();
    renderTopbar({ onOpenMobileNav: handleOpen });

    await user.click(screen.getByRole('button', { name: /open navigation menu/i }));
    expect(handleOpen).toHaveBeenCalledTimes(1);
  });

  it('opens the profile menu and closes it when clicking outside', async () => {
    const user = userEvent.setup();
    renderTopbar();

    const avatarButton = screen.getByRole('button', { name: /toggle user profile menu/i });
    expect(avatarButton).toHaveAttribute('aria-expanded', 'false');

    await user.click(avatarButton);
    expect(avatarButton).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menu', { name: /user profile menu/i })).toBeInTheDocument();

    await user.click(document.body);
    expect(avatarButton).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('keeps the profile menu open when the avatar toggle is clicked a second time (mousedown-outside + click re-toggles)', async () => {
    const user = userEvent.setup();
    renderTopbar();

    const avatarButton = screen.getByRole('button', { name: /toggle user profile menu/i });

    await user.click(avatarButton);
    await user.click(avatarButton);

    // Documented real behavior: the dropdown's outside-mousedown handler closes
    // the menu first, then the button's click handler re-opens it, so the menu
    // remains visible and the button stays in the expanded state.
    expect(screen.getByRole('menu', { name: /user profile menu/i })).toBeInTheDocument();
    expect(avatarButton).toHaveAttribute('aria-expanded', 'true');
  });
});

describe('Footer', () => {
  it('renders the console attribution', () => {
    render(<Footer />);

    expect(screen.getByText(/Ignite Buddy/i)).toBeInTheDocument();
    expect(screen.getByText(/Admin Console/i)).toBeInTheDocument();
  });
});

describe('AppLayout', () => {
  const renderLayout = (props = {}, { route = '/dashboard' } = {}) =>
    render(
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path="/login" element={<div>Login Screen</div>} />
          <Route
            element={<AppLayout {...props} />}
          >
            <Route path="/dashboard" element={<div>Dashboard Content</div>} />
            <Route path="/buddy" element={<div>Buddy Content</div>} />
            <Route path="/nope" element={<div>Unknown Content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

  it('derives the breadcrumb title from the current route', () => {
    renderLayout({}, { route: '/buddy' });

    expect(within(screen.getByLabelText('Breadcrumb')).getByText('Buddy Control')).toBeInTheDocument();
    expect(screen.getByText('Buddy Content')).toBeInTheDocument();
  });

  it('falls back to "Page Not Found" for unknown routes', () => {
    renderLayout({}, { route: '/nope' });

    expect(within(screen.getByLabelText('Breadcrumb')).getByText('Page Not Found')).toBeInTheDocument();
  });

  it('renders the outlet content, footer and the authenticated user', () => {
    renderLayout();

    expect(screen.getByText('Dashboard Content')).toBeInTheDocument();
    expect(within(screen.getByRole('contentinfo')).getByText(/Admin Console/i)).toBeInTheDocument();
    expect(screen.getByText('Admin User')).toBeInTheDocument();
  });

  it('shows a toast when a toastMessage is supplied', () => {
    renderLayout({ toastMessage: 'Broadcast saved.' });

    expect(screen.getByRole('status')).toHaveTextContent('Broadcast saved.');
  });

  it('signs out the user, notifies and redirects to the login route', async () => {
    const user = userEvent.setup();
    const handleNotify = vi.fn();
    renderLayout({ onNotify: handleNotify });

    await user.click(screen.getByRole('button', { name: /toggle user profile options/i }));
    await user.click(screen.getByRole('menuitem', { name: /sign out/i }));

    expect(authMock.state.logout).toHaveBeenCalledTimes(1);
    expect(handleNotify).toHaveBeenCalledWith('Signed out of Ignite Buddy Admin Console.');
    expect(screen.getByText('Login Screen')).toBeInTheDocument();
  });

  it('opens the mobile navigation overlay from the topbar menu toggle', async () => {
    const user = userEvent.setup();
    renderLayout();

    expect(screen.getByRole('complementary')).not.toHaveClass('sidebar-open');

    await user.click(screen.getByRole('button', { name: /open navigation menu/i }));
    expect(screen.getByRole('complementary')).toHaveClass('sidebar-open');
    expect(screen.getByRole('button', { name: /close navigation overlay/i })).toBeInTheDocument();
  });
});

describe('ProtectedRoute', () => {
  const renderProtected = (children = <div>Protected Content</div>) =>
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route path="/login" element={<div>Login Screen</div>} />
          <Route path="/dashboard" element={<ProtectedRoute>{children}</ProtectedRoute>} />
        </Routes>
      </MemoryRouter>
    );

  it('shows a loading spinner while the session is resolving', () => {
    authMock.state.loading = true;
    authMock.state.isAuthenticated = false;

    const { container } = renderProtected();

    expect(container.querySelector('.btn-spinner')).not.toBeNull();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    expect(screen.queryByText('Login Screen')).not.toBeInTheDocument();
  });

  it('redirects unauthenticated visitors to /login', () => {
    authMock.state.loading = false;
    authMock.state.isAuthenticated = false;

    renderProtected();

    expect(screen.getByText('Login Screen')).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('renders children for an authenticated session', () => {
    authMock.state.loading = false;
    authMock.state.isAuthenticated = true;

    renderProtected();

    expect(screen.getByText('Protected Content')).toBeInTheDocument();
    expect(screen.queryByText('Login Screen')).not.toBeInTheDocument();
  });
});
