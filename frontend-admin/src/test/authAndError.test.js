import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { authService } from '../services/authService';
import { apiClient } from '../services/apiClient';
import { formatErrorMessage } from '../utils/error';

const adminLoginPayload = {
  data: {
    id: 1,
    email: 'admin@campus.demo',
    username: 'admin',
    first_name: 'Admin',
    last_name: 'User',
    full_name: 'Admin User',
    role: 'ADMIN',
    employee_id: '1234567',
    is_active: true,
    is_staff: true,
    is_superuser: true,
    access: 'access-token',
    refresh: 'refresh-token',
  },
};

describe('Auth Service', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    authService.clearSession();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects empty or invalid email', async () => {
    await expect(authService.login({ email: '', password: 'password123' })).rejects.toThrow(
      'Please enter a valid email address.'
    );
    await expect(authService.login({ email: 'invalid-email', password: 'password123' })).rejects.toThrow(
      'Please enter a valid email address.'
    );
  });

  it('rejects short passwords', async () => {
    await expect(authService.login({ email: 'admin@campus.demo', password: '12' })).rejects.toThrow(
      'Email or password is incorrect.'
    );
  });

  it('rejects trainee accounts from the admin console', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValue({
      data: { ...adminLoginPayload.data, role: 'TRAINEE' },
    });

    await expect(
      authService.login({ email: 'trainee@campus.demo', password: 'password123' })
    ).rejects.toThrow('Access denied');
    expect(authService.isAuthenticated()).toBe(false);
  });

  it('successfully logs in with Zero Trust in-memory session without disk persistence', async () => {
    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue(adminLoginPayload);

    const user = await authService.login({
      email: 'admin@campus.demo',
      password: 'password123',
    });

    expect(postSpy).toHaveBeenCalledWith('/accounts/login/', {
      email: 'admin@campus.demo',
      password: 'password123',
    });
    expect(user.email).toBe('admin@campus.demo');
    expect(user.role).toBe('ADMIN');
    expect(authService.isAuthenticated()).toBe(true);
    expect(authService.getAccessToken()).toBe('access-token');
    expect(authService.getCurrentUser().email).toBe('admin@campus.demo');

    // Zero Trust: verify tokens are never stored to localStorage or sessionStorage
    expect(localStorage.getItem('ignite_buddy_auth')).toBeNull();
    expect(sessionStorage.getItem('ignite_buddy_auth')).toBeNull();
  });

  it('successfully logs out and clears authentication', async () => {
    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue(adminLoginPayload);

    await authService.login({
      email: 'admin@campus.demo',
      password: 'password123',
    });
    expect(authService.isAuthenticated()).toBe(true);

    await authService.logout();
    expect(authService.isAuthenticated()).toBe(false);
    expect(authService.getCurrentUser()).toBeNull();
    expect(postSpy).toHaveBeenCalledWith('/accounts/logout/', { refresh: 'refresh-token' });
    expect(localStorage.getItem('ignite_buddy_auth')).toBeNull();
    expect(sessionStorage.getItem('ignite_buddy_auth')).toBeNull();
  });
});

describe('Error Sanitization (formatErrorMessage)', () => {
  it('does NOT render raw HTML error dumps from Django debug pages', () => {
    const htmlError = {
      name: 'ApiError',
      status: 404,
      details: '<!DOCTYPE html><html lang="en"><head><title>Page not found at /api/settings/buddy/</title></head><body><h1>Page not found</h1></body></html>',
    };

    const formatted = formatErrorMessage(htmlError);
    expect(formatted).not.toContain('<!DOCTYPE');
    expect(formatted).not.toContain('<html');
    expect(formatted).toContain('Backend endpoint not found (404)');
  });

  it('formats network failure properly', () => {
    const netErr = new Error('Failed to fetch');
    const formatted = formatErrorMessage(netErr);
    expect(formatted).toContain('Unable to reach the server');
  });

  it('formats standard DRF dictionary errors', () => {
    const drfError = {
      details: {
        title: ['Title is required.'],
        message: ['Ensure this field has at least 5 characters.'],
      },
    };
    const formatted = formatErrorMessage(drfError);
    expect(formatted).toContain('title: Title is required.');
    expect(formatted).toContain('message: Ensure this field has at least 5 characters.');
  });
});
