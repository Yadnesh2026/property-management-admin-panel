require("dotenv").config();

const express = require("express");
const cors = require("cors");
const {
  flatSchema,
  roomSchema,
  bedSchema,
  bedStatusSchema,
  tenantSchema,
  tenantAssignmentSchema,
  validate,
} = require("./validators");
const {
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
} = require("./services");

const app = express();
const PORT = process.env.PORT || 4000;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";
const allowedOrigins = FRONTEND_URL.split(",")
  .map((value) => value.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // Allow same-origin/server-to-server/no-origin requests (curl, health checks).
      if (!origin) {
        return callback(null, true);
      }

      // Exact matches from env (supports comma-separated list).
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      // Allow Vercel preview URLs if you use them.
      try {
        const url = new URL(origin);
        if (url.hostname.endsWith(".vercel.app")) {
          return callback(null, true);
        }
      } catch {
        // ignore invalid origin
      }

      return callback(new Error("CORS blocked: origin not allowed."));
    },
    credentials: true,
  })
);
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "property-management-api" });
});

app.get("/api/flats", async (_req, res, next) => {
  try {
    res.json(await listFlats());
  } catch (error) {
    next(error);
  }
});

app.post("/api/flats", async (req, res, next) => {
  try {
    const data = validate(flatSchema, req.body);
    res.status(201).json(await createFlat(data));
  } catch (error) {
    next(error);
  }
});

app.delete("/api/flats/:id", async (req, res, next) => {
  try {
    const result = await deleteFlat(Number(req.params.id), req.query.force === "true");
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.get("/api/rooms", async (_req, res, next) => {
  try {
    res.json(await listRooms());
  } catch (error) {
    next(error);
  }
});

app.post("/api/rooms", async (req, res, next) => {
  try {
    const data = validate(roomSchema, req.body);
    res.status(201).json(await createRoom(data));
  } catch (error) {
    next(error);
  }
});

app.delete("/api/rooms/:id", async (req, res, next) => {
  try {
    res.json(await deleteRoom(Number(req.params.id)));
  } catch (error) {
    next(error);
  }
});

app.get("/api/beds", async (_req, res, next) => {
  try {
    res.json(await listBeds());
  } catch (error) {
    next(error);
  }
});

app.post("/api/beds", async (req, res, next) => {
  try {
    const data = validate(bedSchema, req.body);
    res.status(201).json(await createBed(data));
  } catch (error) {
    next(error);
  }
});

app.patch("/api/beds/:id/status", async (req, res, next) => {
  try {
    const data = validate(bedStatusSchema, req.body);
    res.json(await updateBedStatus(Number(req.params.id), data.status));
  } catch (error) {
    next(error);
  }
});

app.delete("/api/beds/:id", async (req, res, next) => {
  try {
    res.json(await deleteBed(Number(req.params.id)));
  } catch (error) {
    next(error);
  }
});

app.get("/api/tenants", async (_req, res, next) => {
  try {
    res.json(await listTenants());
  } catch (error) {
    next(error);
  }
});

app.post("/api/tenants", async (req, res, next) => {
  try {
    const data = validate(tenantSchema, req.body);
    res.status(201).json(await createTenant(data));
  } catch (error) {
    next(error);
  }
});

app.patch("/api/tenants/:id/assignment", async (req, res, next) => {
  try {
    const data = validate(tenantAssignmentSchema, req.body);
    res.json(await assignTenant(Number(req.params.id), data.bed_id));
  } catch (error) {
    next(error);
  }
});

app.delete("/api/tenants/:id/assignment", async (req, res, next) => {
  try {
    res.json(await unassignTenant(Number(req.params.id)));
  } catch (error) {
    next(error);
  }
});

app.delete("/api/tenants/:id", async (req, res, next) => {
  try {
    res.json(await deleteTenant(Number(req.params.id)));
  } catch (error) {
    next(error);
  }
});

app.get("/api/occupancy", async (_req, res, next) => {
  try {
    res.json(await getOccupancy());
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  const status = error.status || 500;
  res.status(status).json({
    message: error.message || "Something went wrong.",
    requiresConfirmation: Boolean(error.requiresConfirmation),
    activeAssignments: error.activeAssignments || 0,
  });
});

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
