'use client';
import { createBrowser } from './supabase/browser';

export interface Uploaded { path: string; name: string; bytes: number }

/** Dosyayı sunucudan alınan imzalı URL ile doğrudan Supabase Storage'a yükler (Vercel 4,5 MB gövde sınırına takılmaz). */
export async function uploadFile(kind: 'bundle' | 'local', file: File): Promise<Uploaded> {
  const r = await fetch('/api/uploads', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind, filename: file.name, size: file.size }) });
  const j = (await r.json()) as { path?: string; token?: string; name?: string; error?: string };
  if (!r.ok || !j.path || !j.token) throw new Error(j.error ?? 'Yükleme başlatılamadı.');
  const { error } = await createBrowser().storage.from('rea-uploads').uploadToSignedUrl(j.path, j.token, file, { contentType: file.type || 'application/octet-stream' });
  if (error) throw new Error(`Yükleme başarısız: ${error.message}`);
  return { path: j.path, name: j.name ?? file.name, bytes: file.size };
}

export async function api<T>(url: string, method: string, body?: unknown): Promise<T> {
  const r = await fetch(url, { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  const j = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw new Error((j as { error?: string }).error ?? `İstek başarısız (${r.status})`);
  return j;
}
