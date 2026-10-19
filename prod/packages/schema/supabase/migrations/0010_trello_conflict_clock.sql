-- JS Ecosystem · 0010 Trello çakışma kuralı: yalnızca gerçek JS yazması (updated_at > synced_at) Trello'dan geleni engeller.
-- İçe aktarma/birleştirme yazması synced_at'i uygulama saatiyle yazar; DB saati (now()) ile arasındaki kayma "JS düzenlemesi" gibi görünmesin
-- diye Trello kaynaklı yazmada synced_at = updated_at (aynı now()) yapılır. JS yazması (işaretsiz) synced_at'e dokunmaz → updated_at > synced_at.
create or replace function core.tasks_touch() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if new.sync_origin is not distinct from old.sync_origin and new.synced_at is not distinct from old.synced_at then
    new.sync_origin := null;                  -- JS tarafı yazma: işareti temizle
  elsif new.sync_origin = 'trello' then
    new.synced_at := new.updated_at;          -- Trello kaynaklı yazma: synced_at == updated_at
  end if;
  return new;
end $$;
