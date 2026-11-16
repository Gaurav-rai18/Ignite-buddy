import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  apiClient,
  ApiError,
  setAuthTokenGetter,
  setOnUnauthorized,
} from '../services/apiClient';

/**
 * apiClient is an axios instance. To exercise the real request/response
 * interceptors (auth header injection, 401 revocation, error mapping) we swap
 * in a deterministic adapter instead of stubbing the whole module.
 */
const originalAdapter = apiClient.defaults.adapter;

function useAdapter(handler) {
  apiClient.defaults.adapter = (config) => handler(config);
}

function axiosError(config, status, data, message = `Request failed with status code ${status}`) {
  const err = new Error(message);
  err.config = config;
  err.isAxiosError = true;
  err.response = { status, statusText: '', data, headers: {}, config };
  return err;
}

describe('apiClient', () => {
  afterEach(() => {
    apiClient.defaults.adapter = originalAdapter;
    setAuthTokenGetter(() => null);
    setOnUnauthorized(null);
    vi.restoreAllMocks();
  });

  it('performs a successful GET request and resolves the JSON body', async () => {
    const mockData = { broadcast_count: 5, scheduled_count: 2 };
    let captured;
    useAdapter(async (config) => {
      captured = config;
      return { data: mockData, status: 200, statusText: 'OK', headers: {}, config };
    });

    const res = await apiClient.get('/dashboard/');

    expect(res.status).toBe(200);
    expect(res.data).toEqual(mockData);
    expect(captured.url).toBe('/dashboard/');
    expect(captured.method).toBe('get');
  });

  it('performs a successful POST request and serializes the JSON body', async () => {
    const payload = { title: 'Exam update', message: 'Details', audience: 'All students' };
    const responseData = { id: 1, ...payload };
    let captured;
    useAdapter(async (config) => {
      captured = config;
      return { data: responseData, status: 201, statusText: 'Created', headers: {}, config };
    });

    const res = await apiClient.post('/broadcasts/', payload);

    expect(res.status).toBe(201);
    expect(res.data).toEqual(responseData);
    expect(captured.url).toBe('/broadcasts/');
    expect(captured.method).toBe('post');
    // axios default transformRequest serializes objects to a JSON string
    expect(JSON.parse(captured.data)).toEqual(payload);
  });

  it('throws an ApiError carrying the server detail on HTTP 400', async () => {
    useAdapter(async (config) =>
      Promise.reject(axiosError(config, 400, { detail: 'enabled must be true or false' }))
    );

    let error;
    try {
      await apiClient.patch('/settings/buddy/', { enabled: 'invalid' });
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(400);
    expect(error.message).toBe('enabled must be true or false');
    expect(error.details).toEqual({ detail: 'enabled must be true or false' });
  });

  it('handles 204 No Content gracefully without throwing', async () => {
    useAdapter(async (config) => ({ data: '', status: 204, statusText: 'No Content', headers: {}, config }));

    const res = await apiClient.delete('/schedules/1/');

    expect(res.status).toBe(204);
    expect(res.data).toBe('');
  });

  it('throws an ApiError with status 0 on a network failure', async () => {
    useAdapter(async () => {
      throw new Error('Network Error');
    });

    let error;
    try {
      await apiClient.get('/dashboard/');
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(0);
    expect(error.message).toBe('Network Error');
  });

  it('attaches the in-memory Bearer token and revokes the session on 401', async () => {
    const tokenGetter = vi.fn().mockReturnValue('abc123');
    setAuthTokenGetter(tokenGetter);
    const onUnauthorized = vi.fn();
    setOnUnauthorized(onUnauthorized);

    let captured;
    useAdapter(async (config) => {
      captured = config;
      return Promise.reject(axiosError(config, 401, { detail: 'Auth credentials were not provided.' }, 'Unauthorized'));
    });

    await expect(apiClient.get('/accounts/me/')).rejects.toThrow('Auth credentials were not provided.');

    expect(captured.headers.Authorization).toBe('Bearer abc123');
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('passes through intentional request cancellations without wrapping them', async () => {
    useAdapter(async () => {
      const cancel = new Error('canceled');
      cancel.name = 'CanceledError';
      cancel.code = 'ERR_CANCELED';
      throw cancel;
    });

    await expect(apiClient.get('/dashboard/')).rejects.toMatchObject({
      name: 'CanceledError',
      code: 'ERR_CANCELED',
    });
  });
});
