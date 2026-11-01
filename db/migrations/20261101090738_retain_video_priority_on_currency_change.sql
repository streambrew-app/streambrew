-- migrate:up
CREATE OR REPLACE FUNCTION set_video_priority_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  owner_id int;
BEGIN
  owner_id := coalesce(
    NEW.user_id,
    (SELECT user_id FROM donation WHERE donation_id = NEW.donation_id)
  );

  IF NEW.video_queue_id IS NULL THEN
    SELECT video_queue_id
    INTO NEW.video_queue_id
    FROM video_queue
    WHERE user_id = owner_id
      AND is_default;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM video_queue
    WHERE video_queue_id = NEW.video_queue_id
      AND user_id = owner_id
  ) THEN
    RAISE EXCEPTION 'video queue does not belong to video owner';
  END IF;

  IF NEW.video_priority_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM video_priority
    WHERE video_priority_id = NEW.video_priority_id
      AND user_id = owner_id
  ) THEN
    RAISE EXCEPTION 'video priority does not belong to video owner';
  END IF;

  IF NEW.queue_amount IS NULL OR NEW.end_seconds IS NULL OR
     (NEW.duration_seconds IS NOT NULL AND NEW.start_seconds >= NEW.duration_seconds) THEN
    NEW.video_priority_id := NULL;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND
     (NEW.queue_amount IS NOT DISTINCT FROM OLD.queue_amount OR
      current_setting('streambrew.retain_video_priority', TRUE) = 'on') AND
     NEW.start_seconds = OLD.start_seconds AND
     NEW.end_seconds IS NOT DISTINCT FROM OLD.end_seconds AND
     NEW.donation_id IS NOT DISTINCT FROM OLD.donation_id AND
     NEW.user_id IS NOT DISTINCT FROM OLD.user_id AND
     NEW.video_priority_id IS NOT DISTINCT FROM OLD.video_priority_id AND
     OLD.video_priority_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT video_priority.video_priority_id
  INTO NEW.video_priority_id
  FROM video_priority
  WHERE video_priority.user_id = owner_id
    AND video_priority.min_price_per_minute <=
      NEW.queue_amount * 60 / (NEW.end_seconds - NEW.start_seconds)
  ORDER BY video_priority.min_price_per_minute DESC, video_priority.video_priority_id ASC
  LIMIT 1;

  IF NEW.video_priority_id IS NULL THEN
    RAISE EXCEPTION 'no video priority for user %, amount %, start %, end %',
      owner_id, NEW.queue_amount, NEW.start_seconds, NEW.end_seconds;
  END IF;

  RETURN NEW;
END;
$$;

-- migrate:down
CREATE OR REPLACE FUNCTION set_video_priority_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  owner_id int;
BEGIN
  owner_id := coalesce(
    NEW.user_id,
    (SELECT user_id FROM donation WHERE donation_id = NEW.donation_id)
  );

  IF NEW.video_queue_id IS NULL THEN
    SELECT video_queue_id
    INTO NEW.video_queue_id
    FROM video_queue
    WHERE user_id = owner_id
      AND is_default;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM video_queue
    WHERE video_queue_id = NEW.video_queue_id
      AND user_id = owner_id
  ) THEN
    RAISE EXCEPTION 'video queue does not belong to video owner';
  END IF;

  IF NEW.video_priority_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM video_priority
    WHERE video_priority_id = NEW.video_priority_id
      AND user_id = owner_id
  ) THEN
    RAISE EXCEPTION 'video priority does not belong to video owner';
  END IF;

  IF NEW.queue_amount IS NULL OR NEW.end_seconds IS NULL OR
     (NEW.duration_seconds IS NOT NULL AND NEW.start_seconds >= NEW.duration_seconds) THEN
    NEW.video_priority_id := NULL;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND
     NEW.queue_amount IS NOT DISTINCT FROM OLD.queue_amount AND
     NEW.start_seconds = OLD.start_seconds AND
     NEW.end_seconds IS NOT DISTINCT FROM OLD.end_seconds AND
     NEW.donation_id IS NOT DISTINCT FROM OLD.donation_id AND
     NEW.user_id IS NOT DISTINCT FROM OLD.user_id AND
     NEW.video_priority_id IS NOT DISTINCT FROM OLD.video_priority_id AND
     OLD.video_priority_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT video_priority.video_priority_id
  INTO NEW.video_priority_id
  FROM video_priority
  WHERE video_priority.user_id = owner_id
    AND video_priority.min_price_per_minute <=
      NEW.queue_amount * 60 / (NEW.end_seconds - NEW.start_seconds)
  ORDER BY video_priority.min_price_per_minute DESC, video_priority.video_priority_id ASC
  LIMIT 1;

  IF NEW.video_priority_id IS NULL THEN
    RAISE EXCEPTION 'no video priority for user %, amount %, start %, end %',
      owner_id, NEW.queue_amount, NEW.start_seconds, NEW.end_seconds;
  END IF;

  RETURN NEW;
END;
$$;
