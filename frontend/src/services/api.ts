import type { DesignMode } from '../types';

const PRODUCTION_API_BASE_URL = 'https://zenopher-api.aarushsinghvcd.workers.dev';
const configuredApiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').trim();
const localApiBaseUrl = /^(https?:\/\/)?(localhost|127\.0\.0\.1)(:\d+)?$/i.test(configuredApiBaseUrl);
const API_BASE_URL = (import.meta.env.PROD && localApiBaseUrl ? PRODUCTION_API_BASE_URL : configuredApiBaseUrl).replace(/\/$/, '');
const ACCESS_TOKEN_KEY = 'zenopher_access_token';
const USER_KEY = 'zenopher_session_user';

export interface ApiUser {
  id: string;
  email: string;
  display_name: string;
}

export interface ApiDesignMeta {
  id: string;
  title: string;
  mode: DesignMode;
  style_id: string | null;
  width_px: number;
  height_px: number;
  current_version: number;
  trashed_at: number | null;
  created_at: number;
  updated_at: number;
  role?: 'owner' | 'viewer';
}

export interface ApiShare {
  id: string;
  kind: 'link' | 'user';
  permission: 'view' | 'comment';
  grantee_email?: string | null;
  expires_at: number | null;
  revoked_at: number | null;
  created_at: number;
}

export interface ApiConfig {
  features: { critique: boolean; storage_available: boolean };
  limits: {
    max_asset_bytes: number;
    max_version_bytes: number;
    critique_daily_limit: number;
    critique_max_image_px: number;
    r2_hard_limit_bytes: number;
    r2_used_bytes: number;
  };
}

export interface ApiAccount {
  id: string;
  email: string;
  email_verified: number;
  display_name: string;
  status: 'active' | 'pending_deletion';
  deletion_at: number | null;
  created_at: number;
}

export interface ApiConsent {
  purpose: 'critique' | 'learning';
  decision: 'granted' | 'withdrawn';
  policy_version: string;
  created_at: number;
}

export interface ApiCritiqueResult {
  text: string;
  cached: boolean;
}

export interface SessionResponse {
  access_token: string;
  expires_in: number;
  user: ApiUser;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class BackendUnavailableError extends Error {
  constructor(message = 'The Zenopher backend is not configured or cannot be reached.') {
    super(message);
    this.name = 'BackendUnavailableError';
  }
}

type RequestOptions = Omit<RequestInit, 'body'> & { body?: unknown; skipRefresh?: boolean };

function readStoredUser(): ApiUser | null {
  try {
    const raw = sessionStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) as ApiUser : null;
  } catch {
    return null;
  }
}

function storeSession(session: SessionResponse): void {
  sessionStorage.setItem(ACCESS_TOKEN_KEY, session.access_token);
  sessionStorage.setItem(USER_KEY, JSON.stringify(session.user));
}

function clearStoredSession(): void {
  sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
}

function isJsonBody(body: unknown): boolean {
  return !!body && typeof body === 'object' && !(body instanceof FormData) && !(body instanceof Blob) && !(body instanceof ArrayBuffer) && !(body instanceof Uint8Array);
}

export class ZenopherApi {
  readonly baseUrl = API_BASE_URL;
  private accessToken = sessionStorage.getItem(ACCESS_TOKEN_KEY);
  private refreshPromise: Promise<SessionResponse | null> | null = null;

  get configured(): boolean {
    return Boolean(this.baseUrl);
  }

  get user(): ApiUser | null {
    return readStoredUser();
  }

  get authenticated(): boolean {
    return Boolean(this.accessToken);
  }

  private async requestResponse(path: string, options: RequestOptions = {}): Promise<Response> {
    if (!this.configured) throw new BackendUnavailableError();

    const { skipRefresh, ...requestInit } = options;
    const headers = new Headers(options.headers);
    const body = isJsonBody(options.body) ? JSON.stringify(options.body) : options.body;
    if (isJsonBody(options.body) && !headers.has('content-type')) headers.set('content-type', 'application/json');
    if (this.accessToken) headers.set('authorization', `Bearer ${this.accessToken}`);

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/v1${path}`, {
        ...requestInit,
        body: body as BodyInit | undefined,
        headers,
        credentials: 'include',
      });
    } catch {
      throw new BackendUnavailableError();
    }

    if (response.status === 401 && !skipRefresh && !path.startsWith('/auth/')) {
      const refreshed = await this.refreshSession();
      if (refreshed) return this.requestResponse(path, { ...options, skipRefresh: true });
    }

    return response;
  }

  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const response = await this.requestResponse(path, options);
    if (response.status === 204) return undefined as T;

    const contentType = response.headers.get('content-type') ?? '';
    const payload = contentType.includes('application/json')
      ? await response.json().catch(() => null)
      : await response.text();

    if (!response.ok) {
      const body = payload && typeof payload === 'object' ? payload as { error?: { code?: string; message?: string; [key: string]: unknown } } : {};
      throw new ApiError(
        body.error?.message ?? `Request failed with status ${response.status}.`,
        response.status,
        body.error?.code ?? 'request_failed',
        body.error,
      );
    }
    return payload as T;
  }

  private async binary(path: string, options: RequestOptions = {}): Promise<Blob> {
    const response = await this.requestResponse(path, options);
    if (!response.ok) {
      const payload = await response.json().catch(() => null) as { error?: { code?: string; message?: string; [key: string]: unknown } } | null;
      throw new ApiError(
        payload?.error?.message ?? `Request failed with status ${response.status}.`,
        response.status,
        payload?.error?.code ?? 'request_failed',
        payload?.error,
      );
    }
    return response.blob();
  }

  async requestMagicLink(email: string, turnstileToken?: string): Promise<void> {
    await this.request('/auth/magic', { method: 'POST', body: { email, turnstile_token: turnstileToken } });
  }

  async verifyMagicLink(token: string): Promise<SessionResponse> {
    const session = await this.request<SessionResponse>('/auth/verify', { method: 'POST', body: { token } });
    storeSession(session);
    this.accessToken = session.access_token;
    return session;
  }

  async signInWithGoogle(code: string, codeVerifier: string, redirectUri: string): Promise<SessionResponse> {
    const session = await this.request<SessionResponse>('/auth/google', {
      method: 'POST',
      body: { code, code_verifier: codeVerifier, redirect_uri: redirectUri },
    });
    storeSession(session);
    this.accessToken = session.access_token;
    return session;
  }

  async refreshSession(): Promise<SessionResponse | null> {
    if (!this.configured) return null;
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = this.request<SessionResponse>('/auth/refresh', { method: 'POST', skipRefresh: true })
      .then((session) => {
        storeSession(session);
        this.accessToken = session.access_token;
        return session;
      })
      .catch(() => {
        this.accessToken = null;
        clearStoredSession();
        return null;
      })
      .finally(() => { this.refreshPromise = null; });
    return this.refreshPromise;
  }

  async signOut(): Promise<void> {
    try { await this.request('/auth/signout', { method: 'POST', skipRefresh: true }); }
    finally { this.accessToken = null; clearStoredSession(); }
  }

  async signOutAll(): Promise<void> {
    try { await this.request('/auth/signout-all', { method: 'POST' }); }
    finally { this.accessToken = null; clearStoredSession(); }
  }

  getConfig(): Promise<ApiConfig> {
    return this.request<ApiConfig>('/config');
  }

  listDesigns(trashed = false): Promise<{ designs: ApiDesignMeta[] }> {
    return this.request(`/designs${trashed ? '?trashed=1' : ''}`);
  }

  listSharedDesigns(): Promise<{ designs: ApiDesignMeta[] }> {
    return this.request('/designs/shared');
  }

  getDesign(id: string): Promise<ApiDesignMeta> {
    return this.request(`/designs/${encodeURIComponent(id)}`);
  }

  createDesign(input: { id: string; title: string; mode: DesignMode; styleId?: string; width: number; height: number }): Promise<ApiDesignMeta> {
    return this.request('/designs', {
      method: 'POST',
      body: { id: input.id, title: input.title, mode: input.mode, style_id: input.styleId ?? null, width_px: input.width, height_px: input.height },
    });
  }

  updateDesign(id: string, input: { title?: string; mode?: DesignMode; styleId?: string | null }): Promise<{ ok: true }> {
    return this.request(`/designs/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: { title: input.title, mode: input.mode, style_id: input.styleId },
    });
  }

  moveDesignToTrash(id: string): Promise<{ ok: true }> {
    return this.request(`/designs/${encodeURIComponent(id)}/trash`, { method: 'POST' });
  }

  restoreDesign(id: string): Promise<{ ok: true }> {
    return this.request(`/designs/${encodeURIComponent(id)}/restore`, { method: 'POST' });
  }

  permanentlyDeleteDesign(id: string): Promise<void> {
    return this.request(`/designs/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  saveDesignVersion(id: string, body: Uint8Array, baseVersion: number, contentHash: string, idempotencyKey?: string): Promise<{ version: number; content_hash: string }> {
    const headers: Record<string, string> = {
      'content-type': 'application/gzip',
      'x-base-version': String(baseVersion),
      'x-content-hash': contentHash,
    };
    if (idempotencyKey) headers['idempotency-key'] = idempotencyKey;
    return this.request(`/designs/${encodeURIComponent(id)}/versions`, { method: 'POST', body, headers });
  }

  getDesignContent(id: string, version?: number): Promise<Blob> {
    return this.binary(`/designs/${encodeURIComponent(id)}/content${version === undefined ? '' : `?version=${version}`}`);
  }

  getDesignVersions(id: string): Promise<{ versions: Array<{ version: number; byte_size: number; content_hash: string; created_at: number }> }> {
    return this.request(`/designs/${encodeURIComponent(id)}/versions`);
  }

  uploadThumbnail(id: string, png: Blob): Promise<void> {
    return this.request(`/designs/${encodeURIComponent(id)}/thumbnail`, { method: 'PUT', body: png, headers: { 'content-type': 'image/png' } });
  }

  getThumbnail(id: string): Promise<Blob> {
    return this.binary(`/designs/${encodeURIComponent(id)}/thumbnail`);
  }

  uploadAsset(file: Blob): Promise<{ id: string; mime: string; byte_size: number }> {
    return this.request('/assets', { method: 'POST', body: file, headers: { 'content-type': file.type || 'application/octet-stream' } });
  }

  getAsset(id: string, shareToken?: string): Promise<Blob> {
    return this.binary(`/assets/${encodeURIComponent(id)}`, { headers: shareToken ? { 'x-share-token': shareToken } : undefined });
  }

  deleteAsset(id: string): Promise<void> {
    return this.request(`/assets/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  createShare(id: string, input: { permission: 'view' | 'comment'; expiresInDays?: number; email?: string }): Promise<{ id: string; token?: string; url?: string; ok?: true }> {
    return this.request(`/designs/${encodeURIComponent(id)}/shares`, {
      method: 'POST',
      body: input.email
        ? { kind: 'user', email: input.email, permission: input.permission, expires_in_days: input.expiresInDays }
        : { kind: 'link', permission: input.permission, expires_in_days: input.expiresInDays },
    });
  }

  listShares(id: string): Promise<{ shares: ApiShare[] }> {
    return this.request(`/designs/${encodeURIComponent(id)}/shares`);
  }

  revokeShare(id: string, shareId: string): Promise<void> {
    return this.request(`/designs/${encodeURIComponent(id)}/shares/${encodeURIComponent(shareId)}`, { method: 'DELETE' });
  }

  getSharedDesign(token: string): Promise<ApiDesignMeta> {
    return this.request('/shared/design', { headers: { 'x-share-token': token }, skipRefresh: true });
  }

  getSharedContent(token: string): Promise<Blob> {
    return this.binary('/shared/content', { headers: { 'x-share-token': token }, skipRefresh: true });
  }

  requestCritique(image: Blob, meta: unknown): Promise<ApiCritiqueResult> {
    const form = new FormData();
    form.append('image', image, 'design.png');
    form.append('meta', JSON.stringify(meta));
    return this.request('/critique', { method: 'POST', body: form });
  }

  getAccount(): Promise<ApiAccount> {
    return this.request('/account');
  }

  updateAccount(displayName: string): Promise<{ ok: true }> {
    return this.request('/account', { method: 'PATCH', body: { display_name: displayName } });
  }

  startAccountExport(): Promise<{ id: number; status: string }> {
    return this.request('/account/export', { method: 'POST' });
  }

  getAccountExport(jobId: number): Promise<{ id: number; status: string }> {
    return this.request(`/account/export/${jobId}`);
  }

  downloadAccountExport(jobId: number): Promise<Blob> {
    return this.binary(`/account/export/${jobId}/download`);
  }

  scheduleAccountDeletion(): Promise<{ status: 'pending_deletion'; deletion_at: number }> {
    return this.request('/account/delete', { method: 'POST', body: { confirm: 'delete my account' } });
  }

  cancelAccountDeletion(): Promise<{ status: 'active' }> {
    return this.request('/account/delete/cancel', { method: 'POST' });
  }

  getConsent(): Promise<{ consents: ApiConsent[] }> {
    return this.request('/consent');
  }

  setConsent(purpose: 'critique' | 'learning', decision: 'granted' | 'withdrawn', policyVersion: string): Promise<{ ok: true }> {
    return this.request('/consent', { method: 'POST', body: { purpose, decision, policy_version: policyVersion } });
  }

  sendLearningEvents(events: Array<{ rule: string; class?: 'base' | 'pattern' | 'professional'; outcome: 'applied' | 'dismissed' | 'undone'; mode: 'corporate_base' | 'corporate_full'; style_id: string | null; occurred_at: number }>): Promise<{ accepted: number }> {
    return this.request('/learning/events', { method: 'POST', body: { events } });
  }
}

export const api = new ZenopherApi();

export function clearSession(): void {
  clearStoredSession();
}

