const { query, withTransaction } = require("./db");

function appError(message, status = 400, extra = {}) {
  const error = new Error(message);
  error.status = status;
  Object.assign(error, extra);
  return error;
}

async function getFlatById(client, flatId) {
  const result = await client.query("SELECT * FROM flats WHERE id = $1", [flatId]);
  return result.rows[0];
}

async function getRoomById(client, roomId) {
  const result = await client.query("SELECT * FROM rooms WHERE id = $1", [roomId]);
  return result.rows[0];
}

async function getBedById(client, bedId) {
  const result = await client.query(
    `
      SELECT beds.*, rooms.flat_id
      FROM beds
      JOIN rooms ON rooms.id = beds.room_id
      WHERE beds.id = $1
    `,
    [bedId]
  );

  return result.rows[0];
}

async function ensureAssignableBed(client, bedId) {
  const bed = await getBedById(client, bedId);

  if (!bed) {
    throw appError("Bed not found.", 404);
  }

  if (bed.status === "under_maintenance") {
    throw appError("A bed under maintenance cannot be assigned to a tenant.", 409);
  }

  if (bed.status === "occupied") {
    throw appError("This bed is already occupied.", 409);
  }

  return bed;
}

async function setBedStatus(client, bedId, status) {
  await client.query("UPDATE beds SET status = $1, updated_at = NOW() WHERE id = $2", [status, bedId]);
}

async function listFlats() {
  const result = await query(`
    SELECT
      f.id,
      f.name,
      f.address,
      COUNT(DISTINCT r.id) AS room_count,
      COUNT(DISTINCT b.id) AS bed_count,
      COUNT(DISTINCT CASE WHEN b.status = 'occupied' THEN b.id END) AS occupied_beds
    FROM flats f
    LEFT JOIN rooms r ON r.flat_id = f.id
    LEFT JOIN beds b ON b.room_id = r.id
    GROUP BY f.id
    ORDER BY f.id DESC
  `);

  return result.rows;
}

async function createFlat(data) {
  const result = await query(
    "INSERT INTO flats (name, address) VALUES ($1, $2) RETURNING *",
    [data.name, data.address]
  );

  return result.rows[0];
}

async function deleteFlat(flatId, force) {
  return withTransaction(async (client) => {
    const flat = await getFlatById(client, flatId);

    if (!flat) {
      throw appError("Flat not found.", 404);
    }

    const activeAssignments = await client.query(
      `
        SELECT COUNT(*)::int AS count
        FROM tenants t
        JOIN beds b ON b.id = t.active_bed_id
        JOIN rooms r ON r.id = b.room_id
        WHERE r.flat_id = $1
      `,
      [flatId]
    );

    const activeCount = activeAssignments.rows[0].count;

    if (activeCount > 0 && !force) {
      throw appError(
        "This flat has active tenant assignments. Send force=true to confirm deletion.",
        409,
        { requiresConfirmation: true, activeAssignments: activeCount }
      );
    }

    await client.query("DELETE FROM flats WHERE id = $1", [flatId]);
    return { deleted: true, activeAssignments: activeCount };
  });
}

async function listRooms() {
  const result = await query(`
    SELECT
      r.*,
      f.name AS flat_name,
      COUNT(b.id) AS current_bed_count,
      COUNT(CASE WHEN b.status = 'occupied' THEN 1 END) AS occupied_bed_count
    FROM rooms r
    JOIN flats f ON f.id = r.flat_id
    LEFT JOIN beds b ON b.room_id = r.id
    GROUP BY r.id, f.name
    ORDER BY r.id DESC
  `);

  return result.rows;
}

async function createRoom(data) {
  return withTransaction(async (client) => {
    const flat = await getFlatById(client, data.flat_id);

    if (!flat) {
      throw appError("Flat not found.", 404);
    }

    const result = await client.query(
      `
        INSERT INTO rooms (flat_id, name, max_bed_capacity)
        VALUES ($1, $2, $3)
        RETURNING *
      `,
      [data.flat_id, data.name, data.max_bed_capacity]
    );

    return result.rows[0];
  });
}

async function deleteRoom(roomId) {
  return withTransaction(async (client) => {
    const room = await getRoomById(client, roomId);

    if (!room) {
      throw appError("Room not found.", 404);
    }

    const activeAssignments = await client.query(
      `
        SELECT COUNT(*)::int AS count
        FROM tenants
        WHERE active_bed_id IN (SELECT id FROM beds WHERE room_id = $1)
      `,
      [roomId]
    );

    if (activeAssignments.rows[0].count > 0) {
      throw appError("This room has active tenant assignments and cannot be deleted yet.", 409);
    }

    await client.query("DELETE FROM rooms WHERE id = $1", [roomId]);
    return { deleted: true };
  });
}

async function listBeds() {
  const result = await query(`
    SELECT
      b.*,
      r.name AS room_name,
      r.max_bed_capacity,
      f.name AS flat_name,
      t.id AS tenant_id,
      t.full_name AS tenant_name
    FROM beds b
    JOIN rooms r ON r.id = b.room_id
    JOIN flats f ON f.id = r.flat_id
    LEFT JOIN tenants t ON t.active_bed_id = b.id
    ORDER BY b.id DESC
  `);

  return result.rows;
}

async function createBed(data) {
  return withTransaction(async (client) => {
    const room = await getRoomById(client, data.room_id);

    if (!room) {
      throw appError("Room not found.", 404);
    }

    const countResult = await client.query(
      "SELECT COUNT(*)::int AS count FROM beds WHERE room_id = $1",
      [data.room_id]
    );

    if (countResult.rows[0].count >= room.max_bed_capacity) {
      throw appError("Room capacity reached. You cannot add more beds to this room.", 409);
    }

    const result = await client.query(
      "INSERT INTO beds (room_id, name, status) VALUES ($1, $2, $3) RETURNING *",
      [data.room_id, data.name, data.status]
    );

    return result.rows[0];
  });
}

async function updateBedStatus(bedId, status) {
  return withTransaction(async (client) => {
    const bed = await getBedById(client, bedId);

    if (!bed) {
      throw appError("Bed not found.", 404);
    }

    const assignmentCheck = await client.query(
      "SELECT id FROM tenants WHERE active_bed_id = $1 LIMIT 1",
      [bedId]
    );

    if (assignmentCheck.rows[0] && status === "under_maintenance") {
      throw appError("An occupied bed cannot be moved to maintenance until the tenant is reassigned.", 409);
    }

    if (assignmentCheck.rows[0] && status === "available") {
      throw appError("This bed is occupied. Reassign or remove the tenant first.", 409);
    }

    await setBedStatus(client, bedId, status);
    const updated = await getBedById(client, bedId);
    return updated;
  });
}

async function deleteBed(bedId) {
  return withTransaction(async (client) => {
    const bed = await getBedById(client, bedId);

    if (!bed) {
      throw appError("Bed not found.", 404);
    }

    const assignmentCheck = await client.query(
      "SELECT id FROM tenants WHERE active_bed_id = $1 LIMIT 1",
      [bedId]
    );

    if (assignmentCheck.rows[0]) {
      throw appError("You cannot delete a bed while a tenant is assigned to it.", 409);
    }

    await client.query("DELETE FROM beds WHERE id = $1", [bedId]);
    return { deleted: true };
  });
}

async function listTenants() {
  const result = await query(`
    SELECT
      t.*,
      b.name AS bed_name,
      b.status AS bed_status,
      r.name AS room_name,
      f.name AS flat_name
    FROM tenants t
    LEFT JOIN beds b ON b.id = t.active_bed_id
    LEFT JOIN rooms r ON r.id = b.room_id
    LEFT JOIN flats f ON f.id = r.flat_id
    ORDER BY t.id DESC
  `);

  return result.rows;
}

async function createTenant(data) {
  return withTransaction(async (client) => {
    if (data.bed_id) {
      await ensureAssignableBed(client, data.bed_id);
    }

    const result = await client.query(
      `
        INSERT INTO tenants (full_name, email, phone, active_bed_id)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `,
      [data.full_name, data.email || null, data.phone || null, data.bed_id || null]
    );

    if (data.bed_id) {
      await setBedStatus(client, data.bed_id, "occupied");
    }

    return result.rows[0];
  });
}

async function assignTenant(tenantId, bedId) {
  return withTransaction(async (client) => {
    const tenantResult = await client.query("SELECT * FROM tenants WHERE id = $1", [tenantId]);
    const tenant = tenantResult.rows[0];

    if (!tenant) {
      throw appError("Tenant not found.", 404);
    }

    await ensureAssignableBed(client, bedId);

    if (tenant.active_bed_id && tenant.active_bed_id !== bedId) {
      await setBedStatus(client, tenant.active_bed_id, "available");
    }

    await client.query(
      "UPDATE tenants SET active_bed_id = $1, updated_at = NOW() WHERE id = $2",
      [bedId, tenantId]
    );

    await setBedStatus(client, bedId, "occupied");

    const updatedTenant = await client.query("SELECT * FROM tenants WHERE id = $1", [tenantId]);
    return updatedTenant.rows[0];
  });
}

async function unassignTenant(tenantId) {
  return withTransaction(async (client) => {
    const tenantResult = await client.query("SELECT * FROM tenants WHERE id = $1", [tenantId]);
    const tenant = tenantResult.rows[0];

    if (!tenant) {
      throw appError("Tenant not found.", 404);
    }

    if (!tenant.active_bed_id) {
      return tenant;
    }

    await setBedStatus(client, tenant.active_bed_id, "available");
    await client.query("UPDATE tenants SET active_bed_id = NULL, updated_at = NOW() WHERE id = $1", [tenantId]);

    const updatedTenant = await client.query("SELECT * FROM tenants WHERE id = $1", [tenantId]);
    return updatedTenant.rows[0];
  });
}

async function deleteTenant(tenantId) {
  return withTransaction(async (client) => {
    const tenantResult = await client.query("SELECT * FROM tenants WHERE id = $1", [tenantId]);
    const tenant = tenantResult.rows[0];

    if (!tenant) {
      throw appError("Tenant not found.", 404);
    }

    if (tenant.active_bed_id) {
      throw appError("Tenant cannot be deleted while assigned to a bed.", 409);
    }

    await client.query("DELETE FROM tenants WHERE id = $1", [tenantId]);
    return { deleted: true };
  });
}

async function getOccupancy() {
  const flatsResult = await query(`
    SELECT
      f.id,
      f.name,
      COUNT(b.id) AS total_beds,
      COUNT(CASE WHEN b.status = 'occupied' THEN 1 END) AS occupied_beds
    FROM flats f
    LEFT JOIN rooms r ON r.flat_id = f.id
    LEFT JOIN beds b ON b.room_id = r.id
    GROUP BY f.id
    ORDER BY f.id DESC
  `);

  const roomsResult = await query(`
    SELECT
      r.id,
      r.name,
      r.flat_id,
      f.name AS flat_name,
      r.max_bed_capacity,
      COUNT(b.id) AS total_beds,
      COUNT(CASE WHEN b.status = 'occupied' THEN 1 END) AS occupied_beds
    FROM rooms r
    JOIN flats f ON f.id = r.flat_id
    LEFT JOIN beds b ON b.room_id = r.id
    GROUP BY r.id, f.name
    ORDER BY r.id DESC
  `);

  return {
    flats: flatsResult.rows,
    rooms: roomsResult.rows,
  };
}

module.exports = {
  appError,
  listFlats,
  createFlat,
  deleteFlat,
  listRooms,
  createRoom,
  deleteRoom,
  listBeds,
  createBed,
  updateBedStatus,
  deleteBed,
  listTenants,
  createTenant,
  assignTenant,
  unassignTenant,
  deleteTenant,
  getOccupancy,
};
