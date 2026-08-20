import { createClient, type SupportedStorage, type User } from '@supabase/supabase-js'
import type { AppConfig } from './config.js'

export class MutableAuthStorage implements SupportedStorage {
  constructor(readonly values: Record<string, string> = {}) {}

  getItem(key: string): string | null {
    return this.values[key] ?? null
  }

  setItem(key: string, value: string): void {
    this.values[key] = value
  }

  removeItem(key: string): void {
    delete this.values[key]
  }
}

export class SupabaseAuthentication {
  constructor(private readonly config: Pick<AppConfig, 'SUPABASE_URL' | 'SUPABASE_PUBLISHABLE_KEY'>) {}

  async password(email: string, password: string): Promise<User | undefined> {
    const client = this.client(new MutableAuthStorage())
    const { data, error } = await client.auth.signInWithPassword({ email, password })
    if (error || !data.user) return undefined
    return data.user
  }

  async startGoogle(storage: MutableAuthStorage, callbackUrl: string): Promise<string> {
    const client = this.client(storage)
    const { data, error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: callbackUrl, skipBrowserRedirect: true },
    })
    if (error || !data.url) throw new Error('Unable to start Google authentication')
    return data.url
  }

  async signup(
    storage: MutableAuthStorage,
    email: string,
    password: string,
    callbackUrl: string,
  ): Promise<{ user?: User; awaitingVerification: boolean }> {
    const client = this.client(storage)
    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: callbackUrl },
    })
    if (error) throw new Error('Unable to create DJAI account')
    return {
      ...(data.user ? { user: data.user } : {}),
      awaitingVerification: !data.session,
    }
  }

  async exchangeCallback(storage: MutableAuthStorage, code: string): Promise<User | undefined> {
    const client = this.client(storage)
    const { data, error } = await client.auth.exchangeCodeForSession(code)
    if (error || !data.user) return undefined
    return data.user
  }

  private client(storage: SupportedStorage) {
    return createClient(this.config.SUPABASE_URL, this.config.SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        flowType: 'pkce',
        autoRefreshToken: false,
        persistSession: true,
        detectSessionInUrl: false,
        storage,
      },
    })
  }
}
