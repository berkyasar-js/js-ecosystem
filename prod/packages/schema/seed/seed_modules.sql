-- JS Ecosystem seed (modüller) — önkoşul: 0001-0005 + seed.sql. Kullanım:
--   psql "$SUPABASE_DB_URL" -v org_slug=jobs -f seed_modules.sql
-- Yalnızca kurumsal katalog verisi: açık pozisyonlar, ekipman, tedarikçi, ürün/feature flag varsayılanı. Kişisel/maaş verisi YOK.
begin;
select id as org_id from organizations where slug = :'org_slug' \gset
insert into jobs (org_id, data) values
  (:'org_id', '{"slug":"art-director","title":"Art Director","dept":"Kreatif","location":"İstanbul · Hibrit","type":"Tam zamanlı","status":"open","headcount":1,"description":"Marka kampanyalarında görsel yön ve ekip liderliği."}'),
  (:'org_id', '{"slug":"motion-designer","title":"Motion Designer","dept":"Kreatif","location":"İstanbul","type":"Tam zamanlı","status":"open","headcount":1,"description":"Sosyal ve lansman filmleri için hareketli grafik."}');
insert into equipment (org_id, data) values
  (:'org_id', '{"name":"Sony FX3 kamera seti","category":"Kamera","status":"available"}'),
  (:'org_id', '{"name":"Aputure 600d ışık","category":"Işık","status":"available"}'),
  (:'org_id', '{"name":"Rode kablosuz mikrofon","category":"Ses","status":"available"}');
insert into suppliers (org_id, data) values
  (:'org_id', '{"name":"Lensworks Kamera Kiralama","category":"Ekipman","contact":"","email":"info@lensworks.example","rating":4,"terms_days":30,"status":"active"}'),
  (:'org_id', '{"name":"Sahne Atölyesi","category":"Sahne & LED","contact":"","email":"teklif@sahne.example","rating":5,"terms_days":45,"status":"active"}');
-- Tüm ürün paketleri varsayılan AÇIK (feature_flags boşsa hepsi açık sayılır); kapatmak için organizations.settings -> feature_flags.
update organizations set settings = jsonb_set(coalesce(settings,'{}'::jsonb), '{feature_flags}', '{}'::jsonb, true) where id = :'org_id' and not (settings ? 'feature_flags');
commit;
