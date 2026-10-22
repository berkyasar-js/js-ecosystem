'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TaskAttachment, TaskBadges, TaskChecklist, TaskComment } from '@jscore/contracts';
import type { Repo } from '@jscore/core/repo/types';
import { useToast } from '../toasts';

export type Section = 'description' | 'checklist' | 'comments' | 'files' | 'cover';
export const badgesOf = (lists: TaskChecklist[], comments: TaskComment[], files: TaskAttachment[]): TaskBadges => {
  const items = lists.flatMap((l) => l.items);
  return { comments: comments.length, attachments: files.length, checkTotal: items.length, checkDone: items.filter((i) => i.checked).length };
};
export const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'İşlem başarısız');

/**
 * Seçili görevin yorum / checklist / ek verisi + yazma yardımcıları. Sunucu onayı gelmeden yerel durum değişmez;
 * başarıda toast, hatada ilgili bölümün satır içi hatası (`errors[section]`). `onBadges` rozet sayımlarını üst bileşene bildirir.
 */
export function useTaskExtras(repo: Repo | null, taskId: string, onBadges: (taskId: string, b: TaskBadges) => void) {
  const toast = useToast();
  const [comments, setComments] = useState<TaskComment[] | null>(null);
  const [lists, setLists] = useState<TaskChecklist[] | null>(null);
  const [files, setFiles] = useState<TaskAttachment[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Partial<Record<Section, string>>>({});
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const busyRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!repo) return;
    let alive = true;
    setComments(null); setLists(null); setFiles(null); setLoadError(null); setErrors({});
    Promise.all([repo.listComments(taskId), repo.listChecklists(taskId), repo.listAttachments(taskId)]).then(
      ([c, l, f]) => { if (alive) { setComments(c); setLists(l); setFiles(f); } },
      (e) => { if (alive) setLoadError(errMsg(e)); },
    );
    return () => { alive = false; };
  }, [repo, taskId]);

  useEffect(() => { if (comments && lists && files) onBadges(taskId, badgesOf(lists, comments, files)); }, [comments, lists, files, taskId, onBadges]);

  const clear = useCallback((s: Section) => setErrors((e) => (e[s] ? { ...e, [s]: undefined } : e)), []);
  /** Tek yazma: `key` aynı anda tekrar çalışmaz; başarıda toast, hatada satır içi hata. Başarı → {ok:true,value}. */
  const exec = useCallback(async <T,>(section: Section, key: string, fn: () => Promise<T>, ok?: [string, string?]): Promise<{ ok: true; value: T } | { ok: false }> => {
    if (busyRef.current.has(key)) return { ok: false };
    busyRef.current.add(key); setBusy(new Set(busyRef.current)); clear(section);
    try {
      const value = await fn();
      if (ok) toast.success(...ok);
      return { ok: true, value };
    } catch (e) {
      setErrors((x) => ({ ...x, [section]: errMsg(e) }));
      return { ok: false };
    } finally { busyRef.current.delete(key); setBusy(new Set(busyRef.current)); }
  }, [clear, toast]);

  return useMemo(() => ({ comments, lists, files, loadError, errors, busy, exec, clear, setComments, setLists, setFiles, loaded: !!(comments && lists && files) }),
    [comments, lists, files, loadError, errors, busy, exec, clear]);
}
export type TaskExtras = ReturnType<typeof useTaskExtras>;

/** Görsel ek / kapak önizlemeleri için imzalı adres çözücü (oturum boyunca önbellekli, hata → null). */
const urlCache = new Map<string, Promise<string | null>>();
export function resolveUrl(repo: Repo, a: TaskAttachment, download = false): Promise<string | null> {
  const key = `${repo.mode}:${a.id}:${a.storage_path ?? a.url}:${download ? 'd' : 'v'}`;
  let p = urlCache.get(key);
  if (!p) {
    p = repo.attachmentUrl(a, { download }).then((u) => u || null, () => null);
    // Süresi dolan imzalı adresler için 50 dk sonra bırak
    if (a.storage_path) setTimeout(() => urlCache.delete(key), 50 * 60_000);
    urlCache.set(key, p);
  }
  return p;
}
export function useAttachmentUrl(repo: Repo | null, a: TaskAttachment | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  const key = a ? `${a.id}:${a.storage_path ?? a.url}` : '';
  useEffect(() => {
    let alive = true;
    setUrl(null);
    if (repo && a) void resolveUrl(repo, a).then((u) => { if (alive) setUrl(u); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo, key]);
  return url;
}
export const isImage = (a: Pick<TaskAttachment, 'mime' | 'name' | 'url'>) => a.mime.startsWith('image/') || (!a.mime && /\.(png|jpe?g|gif|webp|avif|svg)(\?|$)/i.test(a.name || a.url));
export const fmtBytes = (n: number) => (n <= 0 ? '' : n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${Math.round(n / 102.4) / 10} KB` : `${Math.round(n / 104857.6) / 10} MB`);
