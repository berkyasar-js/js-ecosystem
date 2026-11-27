import { canAccessModule, isClientRole, moduleEntitled, type Me } from '@jscore/contracts';
import { ForbiddenError, type Repo } from '@jscore/core/repo/types';
import prompts from './prompts';

/** Rol gövdesi (Agency `.md` dosyasının ön bilgi sonrası kısmı) — yalnızca sunucu paketinde. */
export const agencyPrompt = (slug: string): string | null => prompts[slug] ?? null;

/** Ajans Ofisi kapısı: iç rol + modül erişimi + modül anahtarı (yönetim panelinden kapatılabilir). */
export async function assertAgencyAccess(repo: Repo, me: Me | null): Promise<Me> {
  if (!me) throw new ForbiddenError('Oturum yok');
  if (isClientRole(me.role) || !canAccessModule(me.role, 'agency')) throw new ForbiddenError('Ajans Ofisi için yetkin yok');
  const settings = await repo.getSettings();
  if (!moduleEntitled('agency', settings.feature_flags)) throw new ForbiddenError('Ajans Ofisi yönetici tarafından kapatıldı');
  return me;
}

export function agencySystemPrompt(body: string, ctx: { project: string | null; task: string | null }): string {
  return [
    body,
    '',
    '---',
    'ÇALIŞMA BAĞLAMI (JS Ecosystem · Ajans Ofisi)',
    `- Proje: ${ctx.project ?? 'belirtilmedi'}${ctx.task ? ` · Görev: ${ctx.task}` : ''}`,
    '- Yanıtını Türkçe ver; kısa ve uygulanabilir olsun (en çok ~500 kelime).',
    '- Bu çalıştırmada araç, dosya, web ya da kod çalıştırma erişimin yok: yalnızca metin üret. Yapamadığın bir adımı yapılmış gibi yazma.',
    '- Elinde olmayan bilgiyi uydurma; varsayımlarını "Varsayımlar" başlığı altında listele.',
  ].join('\n');
}
