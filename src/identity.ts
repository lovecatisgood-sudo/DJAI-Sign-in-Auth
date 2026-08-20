import { createClient, type User } from '@supabase/supabase-js'
import type { AppConfig } from './config.js'

export interface VerifiedIdentity {
  subject: string
  email: string
  emailVerified: true
}

export class IdentityDirectory {
  private readonly admin

  constructor(config: Pick<AppConfig, 'SUPABASE_URL' | 'SUPABASE_SECRET_KEY'>) {
    this.admin = createClient(config.SUPABASE_URL, config.SUPABASE_SECRET_KEY, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    })
  }

  async bySubject(subject: string): Promise<VerifiedIdentity | undefined> {
    const { data, error } = await this.admin.auth.admin.getUserById(subject)
    if (error || !data.user) return undefined
    return this.fromAuthenticatedUser(data.user)
  }

  async fromAuthenticatedUser(user: User): Promise<VerifiedIdentity | undefined> {
    if (!user.email || !user.email_confirmed_at) return undefined
    const { data: profile, error } = await this.admin
      .from('profiles')
      .select('account_status')
      .eq('id', user.id)
      .maybeSingle()
    if (error || !profile || profile.account_status !== 'active') return undefined
    return {
      subject: user.id,
      email: user.email.trim().toLowerCase(),
      emailVerified: true,
    }
  }
}
