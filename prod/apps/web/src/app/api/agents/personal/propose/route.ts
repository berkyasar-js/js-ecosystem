import { z } from 'zod';
import { fail, json } from '@jscore/core/api';
import { getRepo } from '@jscore/core/repo';
import { DepartmentQuotaError } from '@jscore/ai-hub';
import { callModel, demoAgentSchema, enforceBudgets, loadAgent, logRun, personalAgentAccess } from '@/lib/personal-agents-server';

export const maxDuration = 120;
const bodySchema = z.object({
  agent_id: z.string().min(1).max(80), feedback: z.string().trim().min(5).max(2000),
  demo_agent: demoAgentSchema.optional(), demo_spend_usd: z.number().min(0).optional(), demo_cap_usd: z.number().min(0).optional(),
});
const SYSTEM = [
  'Bir yapay zekâ ajanının çalışma talimatını, kullanıcının geri bildirimine göre güncelliyorsun.',
  'Yalnızca güncellenmiş talimat metnini döndür: açıklama, başlık, kod bloğu ya da ön söz yazma.',
  'Mevcut talimatın işe yarayan kısımlarını koru; yalnızca geri bildirimin gerektirdiğini değiştir. Yeni yetki, araç erişimi ya da onay hakkı ekleme.',
  'Türkçe yaz; en çok 400 kelime.',
].join('\n');

/**
 * Ajanın kendini iyileştirme önerisi: yürürlükteki talimat + geri bildirim → önerilen yeni talimat METNİ döner.
 * Bu uç hiçbir şeyi yürürlüğe almaz ve kayıt oluşturmaz: istemci öneriyi taslak sürüm (author='agent') olarak kaydeder; yürürlüğe girmesi onay gerektirir.
 */
export async function POST(req: Request) {
  try {
    const repo = await getRepo();
    const { me, settings } = await personalAgentAccess(repo);
    const body = bodySchema.parse(await req.json());
    const loaded = await loadAgent(repo, body.agent_id, body.demo_agent);
    await enforceBudgets(repo, me, settings, loaded.agent.id, loaded.department, { spend: body.demo_spend_usd, cap: body.demo_cap_usd });
    const user = `MEVCUT TALİMAT (v${loaded.version.version}):\n${loaded.version.instructions}\n\nGERİ BİLDİRİM:\n${body.feedback}`;
    const demoText = `${loaded.version.instructions.trim()}\n- ${body.feedback.replace(/\s+/g, ' ').trim()}`;
    const input = { agent_id: loaded.agent.id, agent_name: loaded.agent.name, owner_employee_id: loaded.agent.owner_employee_id, version: loaded.version.version, department: loaded.department, by: me.name };
    try {
      const call = await callModel(repo, settings, SYSTEM, user, demoText, 1200);
      if (call.text.trim().length < 10) return json({ error: 'Model kullanılabilir bir öneri üretmedi' }, 502);
      await logRun(repo, loaded.agent.id, 'personal_propose', input, { chars_out: call.text.length }, call);
      return json({ mode: call.mode, instructions: call.text.slice(0, 12000), can: loaded.version.can, cannot: loaded.version.cannot, change_note: `Geri bildirim: ${body.feedback.replace(/\s+/g, ' ').slice(0, 300)}`, from_version: loaded.version.version });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Model çağrısı başarısız';
      await logRun(repo, loaded.agent.id, 'personal_propose', input, {}, null, message);
      return json({ error: `Öneri üretilemedi: ${message}` }, 502);
    }
  } catch (e) {
    if (e instanceof DepartmentQuotaError) return json({ error: e.message, code: 'department_quota_exceeded' }, 402);
    return fail(e);
  }
}
