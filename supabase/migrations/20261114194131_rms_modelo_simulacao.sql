alter table public.rms_politicas add column modelo text not null default 'beeprice' check (modelo in ('beeprice','proprio'));
