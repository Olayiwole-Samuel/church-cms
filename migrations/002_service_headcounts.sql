-- Church attendance is now one set of numbers per service, typed in by the admin.
-- Members no longer scan. Workers still scan their department QR (department_attendance),
-- and people in the altar-call track still have individual marks (attendance).
-- programs.qr_token stays for existing rows, but no screen or route uses it any more.
CREATE TABLE service_headcounts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  uuid NOT NULL UNIQUE REFERENCES sessions(id),
  male        integer NOT NULL CHECK (male >= 0),
  female      integer NOT NULL CHECK (female >= 0),
  children    integer NOT NULL CHECK (children >= 0),
  recorded_by text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER service_headcounts_audit AFTER INSERT OR UPDATE ON service_headcounts
  FOR EACH ROW EXECUTE FUNCTION audit_row();
CREATE TRIGGER service_headcounts_no_delete BEFORE DELETE ON service_headcounts
  FOR EACH ROW EXECUTE FUNCTION forbid_delete();
