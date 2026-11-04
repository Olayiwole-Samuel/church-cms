-- Church CMS core schema. Follows section 3 of the specification.
-- Additions beyond the listed model are marked "support" and exist only to make
-- a specified behaviour possible (login, device tokens, rate limits, archiving).

-- ---------------------------------------------------------------- support
CREATE TABLE admins (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL,
  password_hash text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX admins_email_key ON admins (lower(email));

-- ---------------------------------------------------------------- people
CREATE TABLE people (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name        text NOT NULL CHECK (btrim(full_name) <> ''),
  phone            text,
  email            text,
  gender           text,
  address          text,
  first_visit_date date,
  source           text,
  status           text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX people_name_idx ON people (lower(full_name));
CREATE INDEX people_phone_idx ON people (phone);
CREATE INDEX people_status_idx ON people (status);

CREATE TABLE tags (
  id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE
);

CREATE TABLE person_tags (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id  uuid NOT NULL REFERENCES people(id),
  tag_id     uuid NOT NULL REFERENCES tags(id),
  applied_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz                                   -- support: soft delete
);
CREATE UNIQUE INDEX person_tags_current_key ON person_tags (person_id, tag_id) WHERE removed_at IS NULL;

-- ---------------------------------------------------------------- programs
CREATE TABLE programs (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 text NOT NULL CHECK (btrim(name) <> ''),
  type                 text NOT NULL CHECK (type IN ('regular','special')),
  counts_toward_streak boolean NOT NULL DEFAULT true,
  is_sunday            boolean NOT NULL DEFAULT false,
  qr_token             text NOT NULL UNIQUE,
  created_at           timestamptz NOT NULL DEFAULT now(),
  archived_at          timestamptz                         -- support: soft delete
);

CREATE TABLE sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id  uuid NOT NULL REFERENCES programs(id),
  date        date NOT NULL,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),          -- support: same-day ordering
  archived_at timestamptz                                  -- support: soft delete
);
CREATE UNIQUE INDEX sessions_program_date_key ON sessions (program_id, date) WHERE archived_at IS NULL;
CREATE INDEX sessions_date_idx ON sessions (date);

CREATE TABLE attendance (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  uuid NOT NULL REFERENCES sessions(id),
  person_id   uuid NOT NULL REFERENCES people(id),
  present     boolean NOT NULL,
  altar_call  boolean NOT NULL DEFAULT false,
  recorded_by text NOT NULL,
  method      text NOT NULL CHECK (method IN ('admin','qr','on_behalf')),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, person_id)
);
CREATE INDEX attendance_person_idx ON attendance (person_id);

-- ---------------------------------------------------------------- departments
CREATE TABLE departments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL CHECK (btrim(name) <> ''),
  qr_token    text NOT NULL UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz                                  -- support: soft delete
);

-- removed_at IS NULL means this is the person's current department. An admin
-- move between departments closes the old row by setting removed_at while the
-- status stays 'active', so the three specified statuses are unchanged.
CREATE TABLE department_memberships (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id     uuid NOT NULL REFERENCES people(id),
  department_id uuid NOT NULL REFERENCES departments(id),
  status        text NOT NULL DEFAULT 'active'
                CHECK (status IN ('active','waiting_corner','permanently_removed')),
  joined_at     timestamptz NOT NULL DEFAULT now(),
  removed_at    timestamptz,
  CHECK (status <> 'permanently_removed' OR removed_at IS NOT NULL)
);
-- Locked decision: exactly one department per person.
CREATE UNIQUE INDEX one_department_per_person ON department_memberships (person_id) WHERE removed_at IS NULL;
CREATE INDEX department_memberships_dept_idx ON department_memberships (department_id);

CREATE TABLE department_attendance (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    uuid NOT NULL REFERENCES sessions(id),
  person_id     uuid NOT NULL REFERENCES people(id),
  department_id uuid NOT NULL REFERENCES departments(id),
  present       boolean NOT NULL,
  method        text NOT NULL CHECK (method IN ('qr','admin')),
  recorded_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, person_id, department_id)
);
CREATE INDEX department_attendance_person_idx ON department_attendance (person_id, department_id);

CREATE TABLE department_events (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id           uuid NOT NULL REFERENCES people(id),
  department_id       uuid NOT NULL REFERENCES departments(id),
  event_type          text NOT NULL
                      CHECK (event_type IN ('entered_waiting_corner','restored','permanently_removed')),
  miss_count_at_event integer NOT NULL DEFAULT 0,
  occurred_at         timestamptz NOT NULL DEFAULT now(),
  note                text
);
CREATE INDEX department_events_person_idx ON department_events (person_id, department_id, occurred_at);

-- ---------------------------------------------------------------- reviews
CREATE TABLE service_reviews (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid NOT NULL REFERENCES departments(id),
  session_id    uuid NOT NULL REFERENCES sessions(id),
  summary       text,
  challenges    text,
  highlights    text,
  submitted_at  timestamptz,
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','submitted')),
  UNIQUE (department_id, session_id),
  CHECK (status <> 'submitted' OR (submitted_at IS NOT NULL AND btrim(coalesce(summary,'')) <> ''))
);

CREATE TABLE member_notes (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES service_reviews(id),
  person_id uuid NOT NULL REFERENCES people(id),
  note      text NOT NULL CHECK (btrim(note) <> ''),
  UNIQUE (review_id, person_id)
);

-- ---------------------------------------------------------------- care
CREATE TABLE follow_ups (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id   uuid NOT NULL REFERENCES people(id),
  reason      text NOT NULL CHECK (reason IN ('first_timer','drop_off','altar_call','absence')),
  priority    text NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal','high')),
  assigned_to text,
  status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open','done')),
  notes       text,                                        -- support: tracking notes
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX follow_ups_person_idx ON follow_ups (person_id, reason);
CREATE INDEX follow_ups_status_idx ON follow_ups (status);

CREATE TABLE absence_alerts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id    uuid NOT NULL REFERENCES people(id),
  program_id   uuid NOT NULL REFERENCES programs(id),
  triggered_at timestamptz NOT NULL DEFAULT now(),
  resolved     boolean NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX absence_alerts_open_key ON absence_alerts (person_id, program_id) WHERE NOT resolved;

CREATE TABLE enrollments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id   uuid NOT NULL UNIQUE REFERENCES people(id),
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  note        text
);

-- ---------------------------------------------------------------- audit
CREATE TABLE audit_log (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor      text NOT NULL,
  action     text NOT NULL,
  entity     text NOT NULL,
  entity_id  text,
  before     jsonb,
  after      jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_entity_idx ON audit_log (entity, entity_id);
CREATE INDEX audit_log_created_idx ON audit_log (created_at DESC);

-- ---------------------------------------------------------------- caches
-- Computed from attendance. Never authoritative: safe to rebuild at any time.
-- program_id NULL is the general streak across every counting program.
CREATE TABLE person_program_stats (
  person_id          uuid NOT NULL REFERENCES people(id),
  program_id         uuid REFERENCES programs(id),
  current_streak     integer NOT NULL,
  status_badge       text NOT NULL,
  total_attended     integer NOT NULL,
  last_attended      date,
  trailing_misses    integer NOT NULL,
  was_consistent     boolean NOT NULL,
  computed_at        timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX person_program_stats_key ON person_program_stats (person_id, program_id) NULLS NOT DISTINCT;
CREATE INDEX person_program_stats_view_idx ON person_program_stats (program_id, status_badge);

CREATE TABLE person_department_stats (
  person_id     uuid NOT NULL REFERENCES people(id),
  department_id uuid NOT NULL REFERENCES departments(id),
  miss_streak   integer NOT NULL,
  computed_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (person_id, department_id)
);

CREATE TABLE person_academy_stats (
  person_id     uuid PRIMARY KEY REFERENCES people(id),
  sunday_streak integer NOT NULL,
  ready_since   date,                                      -- set once 4 consecutive Sundays reached
  computed_at   timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- support
CREATE TABLE device_tokens (
  token_hash   text PRIMARY KEY,
  person_id    uuid NOT NULL REFERENCES people(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX device_tokens_person_idx ON device_tokens (person_id);

CREATE TABLE possible_duplicates (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id         uuid NOT NULL REFERENCES people(id),
  matched_person_id uuid NOT NULL REFERENCES people(id),
  matched_on        text NOT NULL CHECK (matched_on IN ('phone','name')),
  status            text NOT NULL DEFAULT 'open' CHECK (status IN ('open','dismissed')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (person_id, matched_person_id)
);

CREATE TABLE rate_limits (
  key          text NOT NULL,
  window_start timestamptz NOT NULL,
  count        integer NOT NULL,
  PRIMARY KEY (key, window_start)
);

INSERT INTO tags (name) VALUES ('Member'), ('Altar Call'), ('Discipleship Enrolled');

-- ================================================================= triggers
-- Audit log on every mutation. A trigger rather than application calls, so a
-- code path cannot forget it. The actor is set per transaction by withTx().
CREATE FUNCTION audit_row() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  old_row jsonb := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) - 'password_hash' - 'token_hash' END;
  new_row jsonb := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) - 'password_hash' - 'token_hash' END;
BEGIN
  INSERT INTO audit_log (actor, action, entity, entity_id, before, after)
  VALUES (
    coalesce(nullif(current_setting('app.actor', true), ''), 'system'),
    lower(TG_OP),
    TG_TABLE_NAME,
    coalesce(new_row ->> 'id', old_row ->> 'id'),
    old_row,
    new_row
  );
  RETURN coalesce(NEW, OLD);
END $$;

-- Soft-delete everywhere: authoritative rows can never be hard deleted.
CREATE FUNCTION forbid_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Hard delete is not allowed on %. Archive instead.', TG_TABLE_NAME;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'admins','people','tags','person_tags','programs','sessions','attendance','departments',
    'department_memberships','department_attendance','department_events','service_reviews',
    'member_notes','follow_ups','absence_alerts','enrollments','possible_duplicates'
  ] LOOP
    EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION audit_row()', t || '_audit', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE DELETE ON %I FOR EACH ROW EXECUTE FUNCTION forbid_delete()', t || '_no_delete', t);
  END LOOP;
END $$;

-- The audit log itself is append-only.
CREATE FUNCTION forbid_audit_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END $$;
CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION forbid_audit_change();

-- Locked decisions enforced by the database as well as the application:
--   permanent removal happens only from the Waiting Corner, and is irreversible.
CREATE FUNCTION guard_membership_status() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'permanently_removed' AND (NEW.status <> OLD.status OR NEW.removed_at IS NULL) THEN
    RAISE EXCEPTION 'Permanent removal is irreversible';
  END IF;
  IF NEW.status = 'permanently_removed' AND OLD.status NOT IN ('waiting_corner','permanently_removed') THEN
    RAISE EXCEPTION 'Permanent removal is only allowed from the Waiting Corner';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER department_memberships_guard BEFORE UPDATE ON department_memberships
  FOR EACH ROW EXECUTE FUNCTION guard_membership_status();
