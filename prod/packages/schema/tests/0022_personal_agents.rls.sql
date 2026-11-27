\set QUIET on
\pset tuples_only on
\pset format unaligned
reset role;
delete from public.organizations where slug = 'rls-test';
insert into public.organizations (id, name, slug) values ('00000000-0000-0000-0000-0000000000a0', 'RLS Test', 'rls-test');
insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-000000000001','by@x'),('00000000-0000-0000-0000-000000000002','uc@x'),('00000000-0000-0000-0000-000000000003','sk@x'),
 ('00000000-0000-0000-0000-000000000004','oe@x'),('00000000-0000-0000-0000-000000000005','mk@x'),('00000000-0000-0000-0000-000000000006','cl@x') on conflict do nothing;
insert into public.employees (id, org_id, auth_user_id, code, name, role_title, app_role, manager_id) values
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a0','00000000-0000-0000-0000-000000000001','BY','BY','Kurucu','owner',null),
 ('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000a0','00000000-0000-0000-0000-000000000002','UC','UC','Lider','creative','10000000-0000-0000-0000-000000000001'),
 ('10000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-0000000000a0','00000000-0000-0000-0000-000000000003','SK','SK','AD','creative','10000000-0000-0000-0000-000000000002'),
 ('10000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-0000000000a0','00000000-0000-0000-0000-000000000004','OE','OE','Lider','account','10000000-0000-0000-0000-000000000001'),
 ('10000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-0000000000a0','00000000-0000-0000-0000-000000000005','MK','MK','AM','account','10000000-0000-0000-0000-000000000004');
insert into public.memberships (user_id, org_id, role) values
 ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a0','owner'),('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000a0','creative'),
 ('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-0000000000a0','creative'),('00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-0000000000a0','account'),
 ('00000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-0000000000a0','account'),('00000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-0000000000a0','client_admin');
insert into public.personal_agents (id, org_id, owner_employee_id, data) values
 ('20000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-0000000000a0','10000000-0000-0000-0000-000000000003','{"name":"SK ajanı"}'),
 ('20000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-0000000000a0','10000000-0000-0000-0000-000000000005','{"name":"MK ajanı"}');
\set SK '00000000-0000-0000-0000-000000000003'
\set UC '00000000-0000-0000-0000-000000000002'
\set BY '00000000-0000-0000-0000-000000000001'
\set MK '00000000-0000-0000-0000-000000000005'
\set OE '00000000-0000-0000-0000-000000000004'
\set CL '00000000-0000-0000-0000-000000000006'
set role authenticated;
select set_config('request.jwt.claim.sub', :'SK', false) \g /dev/null
select '01 SK kendi ajanını görür, MK''nınkini görmez → beklenen 1: ' || count(*) from public.personal_agents;
select set_config('request.jwt.claim.sub', :'UC', false) \g /dev/null
select '02 UC (lider) zincirindeki SK ajanını görür → beklenen 1: ' || count(*) from public.personal_agents;
select set_config('request.jwt.claim.sub', :'OE', false) \g /dev/null
select '03 OE (diğer lider) yalnızca MK ajanını görür → beklenen MK ajanı: ' || string_agg(data->>'name', ',') from public.personal_agents;
select set_config('request.jwt.claim.sub', :'BY', false) \g /dev/null
select '04 BY (owner) hepsini görür → beklenen 2: ' || count(*) from public.personal_agents;
select set_config('request.jwt.claim.sub', :'CL', false) \g /dev/null
select '05 müşteri hiçbirini görmez → beklenen 0: ' || count(*) from public.personal_agents;
select set_config('request.jwt.claim.sub', :'MK', false) \g /dev/null
\echo 06 MK, SK adına ajan ekleyemez → beklenen HATA:
insert into public.personal_agents (org_id, owner_employee_id, data) values ('00000000-0000-0000-0000-0000000000a0','10000000-0000-0000-0000-000000000003','{}');
\echo 07 MK, SK ajanına sürüm ekleyemez → beklenen HATA:
insert into public.agent_versions (org_id, agent_id, version, data) values ('00000000-0000-0000-0000-0000000000a0','20000000-0000-0000-0000-000000000003',1,'{}');
select set_config('request.jwt.claim.sub', :'SK', false) \g /dev/null
\echo 08 SK doğrudan yürürlükte sürüm ekleyemez → beklenen HATA:
insert into public.agent_versions (org_id, agent_id, version, status, data) values ('00000000-0000-0000-0000-0000000000a0','20000000-0000-0000-0000-000000000003',1,'active','{}');
insert into public.agent_versions (id, org_id, agent_id, version, data) values ('30000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a0','20000000-0000-0000-0000-000000000003',1,'{"instructions":"v1"}');
select '09 taslak eklendi, ajan hâlâ sürümsüz → beklenen 0: ' || current_version from public.personal_agents where id = '20000000-0000-0000-0000-000000000003';
\echo 10 SK yürürlükteki sürümü elle yükseltemez → beklenen HATA:
update public.personal_agents set current_version = 5 where id = '20000000-0000-0000-0000-000000000003';
update public.agent_versions set status = 'active' where id = '30000000-0000-0000-0000-000000000001';
select '11 onay sonrası → beklenen 1|active|karar veren SK: ' || a.current_version || '|' || v.status || '|' || (v.decided_by = '10000000-0000-0000-0000-000000000003')::text from public.personal_agents a join public.agent_versions v on v.agent_id = a.id where v.id = '30000000-0000-0000-0000-000000000001';
insert into public.agent_versions (id, org_id, agent_id, version, author, data) values ('30000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000a0','20000000-0000-0000-0000-000000000003',2,'agent','{"instructions":"v2"}');
select set_config('request.jwt.claim.sub', :'MK', false) \g /dev/null
update public.agent_versions set status = 'active' where id = '30000000-0000-0000-0000-000000000002';
reset role;
select '12 MK başkasının taslağını onaylayamaz → beklenen draft: ' || status from public.agent_versions where id = '30000000-0000-0000-0000-000000000002';
set role authenticated;
select set_config('request.jwt.claim.sub', :'UC', false) \g /dev/null
update public.agent_versions set status = 'active' where id = '30000000-0000-0000-0000-000000000002';
select '13 lider UC onaylar → beklenen v1 superseded, v2 active, güncel 2: ' || string_agg(v.version || ':' || v.status, ', ' order by v.version) || ' | ' || max(a.current_version) from public.agent_versions v join public.personal_agents a on a.id = v.agent_id where v.agent_id = '20000000-0000-0000-0000-000000000003';
\echo 14 sürüm içeriği değiştirilemez → beklenen HATA:
update public.agent_versions set data = '{"instructions":"hack"}' where id = '30000000-0000-0000-0000-000000000002';
\echo 15 eski sürüm doğrudan yeniden yürürlüğe alınamaz → beklenen HATA:
update public.agent_versions set status = 'active' where id = '30000000-0000-0000-0000-000000000001';
\echo 16 sürüm silinemez → beklenen HATA:
delete from public.agent_versions where id = '30000000-0000-0000-0000-000000000001';
reset role;
delete from public.organizations where slug = 'rls-test';
