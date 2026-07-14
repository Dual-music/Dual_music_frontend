
-- Ensure pg_net is available
create extension if not exists pg_net with schema extensions;

-- Trigger function: enqueue HTTP POST to send-push edge function
create or replace function public.trigger_send_push_on_notification()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_url text := 'https://hvpylzrcbswxhyjbgelz.supabase.co/functions/v1/send-push';
  v_anon text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2cHlsenJjYnN3eGh5amJnZWx6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI3MjE1MTMsImV4cCI6MjA3ODI5NzUxM30.GsSBG9ZAv9raK1Gx7b40Jz5skYQVJUFRPcv1_Uola0Q';
  v_url_path text;
begin
  -- Build a deep link based on notification.type / data when possible
  v_url_path := coalesce(
    nullif(new.data->>'url', ''),
    case new.type
      when 'concert_live' then '/concerts'
      when 'duel_live'    then '/duels'
      when 'live_started' then '/lives'
      else '/'
    end
  );

  perform extensions.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon
    ),
    body := jsonb_build_object(
      'user_id', new.user_id,
      'title', coalesce(new.title, 'Dual Music'),
      'body',  coalesce(new.message, ''),
      'tag',   new.type,
      'url',   v_url_path,
      'data',  coalesce(new.data, '{}'::jsonb)
    )
  );

  return new;
exception when others then
  -- Never block the notification insert
  raise warning 'trigger_send_push_on_notification failed: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists on_notification_insert_send_push on public.notifications;
create trigger on_notification_insert_send_push
after insert on public.notifications
for each row
execute function public.trigger_send_push_on_notification();
