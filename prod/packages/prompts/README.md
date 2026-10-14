# @jscore/prompts

`prompts/*.md`: front-matter (`agent`, `model`, `version`, `output_schema`) + sistem promptu. Dokuz kurul ajanı (CHAIR, CEO, CFO, COO, CMO, CTO, CHRO, CCO, CLO), `inbox_drafts` ve iki ikiz şablonu (`twin_person`, `twin_role`).

```bash
npm run prompts:sql > prompts.sql   # global (org_id null) agent_prompts INSERT'leri, idempotent
psql "$SUPABASE_DB_URL" -f prompts.sql
```
Yeni sürüm: dosyada `version`'ı artır, yeniden üret; eski sürüm pasifleşir, `/api/agents/run` aktif olanı kullanır.
