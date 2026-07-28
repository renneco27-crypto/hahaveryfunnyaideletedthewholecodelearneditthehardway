select cron.schedule(
  'cleanup-old-bullying-reports',
  '0 2 * * *',
  $$
    delete from bullying_reports
    where created_at < now() - interval '10 months';
  $$
);

-- 1. Enable pg_net if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Create/Replace the function with the random delay
CREATE OR REPLACE FUNCTION send_to_make_webhook()
RETURNS TRIGGER AS $$
DECLARE
  random_seconds INT;
BEGIN
  -- Pick a random integer from 1 to 30
  random_seconds := floor(random() * 30 + 1);
  
  -- Pause background execution for that many seconds
  PERFORM pg_sleep(random_seconds);

  -- Dispatch to your Make.com Webhook
  PERFORM net.http_post(
    url := 'https://hook.eu1.make.com/9acokbud64bqr23nugs4gfhjvfdzyj8f',
    body := jsonb_build_object(
      'type', TG_OP,
      'table', TG_TABLE_NAME,
      'record', row_to_json(NEW)
    ),
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Attach the trigger to your table
DROP TRIGGER IF EXISTS trigger_send_to_make ON public.bullying_reports;

CREATE TRIGGER trigger_send_to_make
AFTER INSERT ON public.bullying_reports
FOR EACH ROW
EXECUTE FUNCTION send_to_make_webhook();