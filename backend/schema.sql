-- Property Management Admin Panel schema (Supabase Postgres)
-- Hierarchy: Flat -> Room -> Bed -> Tenant (tenant assigned to a bed)

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'bed_status') THEN
    CREATE TYPE bed_status AS ENUM ('available', 'occupied', 'under_maintenance');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS flats (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rooms (
  id BIGSERIAL PRIMARY KEY,
  flat_id BIGINT NOT NULL REFERENCES flats(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  max_bed_capacity INTEGER NOT NULL CHECK (max_bed_capacity > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS beds (
  id BIGSERIAL PRIMARY KEY,
  room_id BIGINT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status bed_status NOT NULL DEFAULT 'available',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tenants (
  id BIGSERIAL PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT UNIQUE,
  phone TEXT,
  -- A tenant has at most one active assignment, and a bed has at most one active tenant.
  active_bed_id BIGINT UNIQUE REFERENCES beds(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Keep updated_at fresh
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at_flats ON flats;
CREATE TRIGGER set_updated_at_flats
BEFORE UPDATE ON flats
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_rooms ON rooms;
CREATE TRIGGER set_updated_at_rooms
BEFORE UPDATE ON rooms
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_beds ON beds;
CREATE TRIGGER set_updated_at_beds
BEFORE UPDATE ON beds
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_tenants ON tenants;
CREATE TRIGGER set_updated_at_tenants
BEFORE UPDATE ON tenants
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Enforce room capacity at the database level (prevents race-condition overflow).
CREATE OR REPLACE FUNCTION enforce_room_capacity()
RETURNS TRIGGER AS $$
DECLARE
  current_count INTEGER;
  capacity INTEGER;
BEGIN
  SELECT COUNT(*)::int INTO current_count FROM beds WHERE room_id = NEW.room_id;
  SELECT max_bed_capacity INTO capacity FROM rooms WHERE id = NEW.room_id;

  IF capacity IS NULL THEN
    RAISE EXCEPTION 'Room not found.';
  END IF;

  IF current_count >= capacity THEN
    RAISE EXCEPTION 'Room capacity reached. You cannot add more beds to this room.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_room_capacity_on_beds ON beds;
CREATE TRIGGER enforce_room_capacity_on_beds
BEFORE INSERT ON beds
FOR EACH ROW EXECUTE FUNCTION enforce_room_capacity();

-- Prevent changing a bed out of occupied if a tenant is assigned.
CREATE OR REPLACE FUNCTION prevent_invalid_bed_status_change()
RETURNS TRIGGER AS $$
DECLARE
  has_tenant BOOLEAN;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    SELECT EXISTS(SELECT 1 FROM tenants WHERE active_bed_id = NEW.id) INTO has_tenant;

    IF has_tenant AND NEW.status <> 'occupied' THEN
      RAISE EXCEPTION 'This bed is occupied. Reassign or remove the tenant first.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS prevent_invalid_bed_status_change_on_beds ON beds;
CREATE TRIGGER prevent_invalid_bed_status_change_on_beds
BEFORE UPDATE OF status ON beds
FOR EACH ROW EXECUTE FUNCTION prevent_invalid_bed_status_change();

-- Enforce assignable bed + keep bed status in sync with tenant assignment.
CREATE OR REPLACE FUNCTION sync_bed_status_for_tenant_assignment()
RETURNS TRIGGER AS $$
DECLARE
  bed_current_status bed_status;
BEGIN
  -- If assigning a bed, ensure it's assignable.
  IF NEW.active_bed_id IS NOT NULL THEN
    SELECT status INTO bed_current_status FROM beds WHERE id = NEW.active_bed_id FOR UPDATE;

    IF bed_current_status IS NULL THEN
      RAISE EXCEPTION 'Bed not found.';
    END IF;

    IF bed_current_status = 'under_maintenance' THEN
      RAISE EXCEPTION 'A bed under maintenance cannot be assigned to a tenant.';
    END IF;

    IF bed_current_status = 'occupied' THEN
      RAISE EXCEPTION 'This bed is already occupied.';
    END IF;
  END IF;

  -- Free previous bed if the assignment changed.
  IF TG_OP = 'UPDATE' AND OLD.active_bed_id IS DISTINCT FROM NEW.active_bed_id THEN
    IF OLD.active_bed_id IS NOT NULL THEN
      UPDATE beds SET status = 'available' WHERE id = OLD.active_bed_id;
    END IF;
  END IF;

  -- Mark new bed as occupied.
  IF NEW.active_bed_id IS NOT NULL THEN
    UPDATE beds SET status = 'occupied' WHERE id = NEW.active_bed_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_bed_status_on_tenants_insert ON tenants;
CREATE TRIGGER sync_bed_status_on_tenants_insert
AFTER INSERT ON tenants
FOR EACH ROW EXECUTE FUNCTION sync_bed_status_for_tenant_assignment();

DROP TRIGGER IF EXISTS sync_bed_status_on_tenants_update ON tenants;
CREATE TRIGGER sync_bed_status_on_tenants_update
AFTER UPDATE OF active_bed_id ON tenants
FOR EACH ROW EXECUTE FUNCTION sync_bed_status_for_tenant_assignment();

-- If a tenant row is deleted (only possible when not assigned by app logic),
-- ensure any referenced bed is freed anyway.
CREATE OR REPLACE FUNCTION free_bed_on_tenant_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.active_bed_id IS NOT NULL THEN
    UPDATE beds SET status = 'available' WHERE id = OLD.active_bed_id;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS free_bed_on_tenant_delete_trigger ON tenants;
CREATE TRIGGER free_bed_on_tenant_delete_trigger
AFTER DELETE ON tenants
FOR EACH ROW EXECUTE FUNCTION free_bed_on_tenant_delete();

COMMIT;

