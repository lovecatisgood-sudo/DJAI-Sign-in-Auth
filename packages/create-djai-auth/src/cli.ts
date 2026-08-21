#!/usr/bin/env node
import { parseArgs } from 'node:util'
import { resolve } from 'node:path'
import { scaffoldDjaiAuth } from './scaffold.js'

const { values } = parseArgs({
  options: {
    name: { type: 'string' },
    environment: { type: 'string', default: 'development' },
    callback: { type: 'string' },
    home: { type: 'string' },
    privacy: { type: 'string' },
    terms: { type: 'string' },
    directory: { type: 'string', default: '.' },
    api: { type: 'string', default: process.env.DJAI_DEVELOPER_API ?? 'https://id.djai.academy' },
  },
  strict: true,
})

for (const required of ['name', 'callback', 'home', 'privacy', 'terms'] as const) {
  if (!values[required]) throw new Error(`Missing --${required}`)
}
if (!['development', 'staging', 'production'].includes(values.environment)) throw new Error('Invalid --environment')
const token = process.env.DJAI_DEVELOPER_TOKEN
if (!token) throw new Error('DJAI_DEVELOPER_TOKEN is required')

const files = await scaffoldDjaiAuth({
  directory: resolve(values.directory),
  developerApi: values.api,
  developerToken: token,
  displayName: values.name!,
  environment: values.environment as 'development' | 'staging' | 'production',
  callbackUrl: values.callback!,
  homeUrl: values.home!,
  policyUrl: values.privacy!,
  termsUrl: values.terms!,
})

process.stdout.write(`DJAI Sign In configured. Created: ${files.join(', ')}\n`)
process.stdout.write('Install @djai/auth-express, mount djaiAuthRouter at /auth/djai, and add a link to /auth/djai/login.\n')
