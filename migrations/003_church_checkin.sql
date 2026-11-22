-- One member check-in QR for the whole church. Scanning it checks the person in to
-- whichever service is running that day. Older program QR codes keep working the same way.
CREATE TABLE church_settings (
  key        text PRIMARY KEY,
  value      text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER church_settings_audit AFTER INSERT OR UPDATE ON church_settings
  FOR EACH ROW EXECUTE FUNCTION audit_row();
CREATE TRIGGER church_settings_no_delete BEFORE DELETE ON church_settings
  FOR EACH ROW EXECUTE FUNCTION forbid_delete();

-- Keeps the code already printed and on display at the church (it was made for Midweek
-- Service). Anywhere that code does not exist, such as a fresh install, a new one is made.
INSERT INTO church_settings (key, value)
VALUES ('checkin_token', coalesce(
  (SELECT qr_token FROM programs WHERE qr_token = 'a4xUwPzz06WidUsqumecZPQb'),
  replace(gen_random_uuid()::text, '-', '')
));
