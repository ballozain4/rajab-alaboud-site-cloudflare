/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_TURNSTILE_SITE_KEY?: string;
  readonly PUBLIC_CF_ANALYTICS_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface EmailSendResult {
  messageId: string;
}

interface EmailSendBinding {
  send(message: {
    to: string;
    from: string;
    subject: string;
    html?: string;
    text?: string;
  }): Promise<EmailSendResult>;
}

interface D1Result<T = Record<string, unknown>> {
  results: T[];
  success: boolean;
  meta: {
    last_row_id?: number | string;
    changes?: number;
    duration?: number;
    [key: string]: unknown;
  };
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = Record<string, unknown>>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  exec(query: string): Promise<{ count: number; duration: number }>;
}

interface CloudflareEnv {
  DB?: D1Database;
  EMAIL?: EmailSendBinding;
  ADMIN_PASSWORD?: string;
  SESSION_SECRET?: string;
  TURNSTILE_SECRET_KEY?: string;
  NOTIFICATION_EMAIL?: string;
  NOTIFICATION_EMAIL_FROM?: string;
  SITE_URL?: string;
  RESEND_TOKEN?: string;
  ALLOW_DEMO_SUBMISSIONS?: string;
}

declare module 'cloudflare:workers' {
  export const env: CloudflareEnv;
}

declare namespace App {
  interface Locals {
    runtime?: {
      env: CloudflareEnv;
    };
  }
}
