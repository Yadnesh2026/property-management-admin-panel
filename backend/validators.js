const { z } = require("zod");

const flatSchema = z.object({
  name: z.string().trim().min(1, "Flat name is required."),
  address: z.string().trim().min(1, "Flat address is required."),
});

const roomSchema = z.object({
  flat_id: z.coerce.number().int().positive("A valid flat is required."),
  name: z.string().trim().min(1, "Room name is required."),
  max_bed_capacity: z.coerce.number().int().positive("Room capacity must be at least 1."),
});

const bedSchema = z.object({
  room_id: z.coerce.number().int().positive("A valid room is required."),
  name: z.string().trim().min(1, "Bed name is required."),
  status: z.enum(["available", "under_maintenance"]).default("available"),
});

const bedStatusSchema = z.object({
  status: z.enum(["available", "under_maintenance"]),
});

const tenantSchema = z.object({
  full_name: z.string().trim().min(1, "Tenant name is required."),
  email: z
    .string()
    .trim()
    .email("Please enter a valid email address.")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  phone: z.string().trim().optional(),
  bed_id: z.coerce.number().int().positive().optional(),
});

const tenantAssignmentSchema = z.object({
  bed_id: z.coerce.number().int().positive("A valid bed is required."),
});

function validate(schema, payload) {
  const result = schema.safeParse(payload);

  if (!result.success) {
    const message = result.error.issues[0]?.message || "Invalid request data.";
    const error = new Error(message);
    error.status = 400;
    throw error;
  }

  return result.data;
}

module.exports = {
  flatSchema,
  roomSchema,
  bedSchema,
  bedStatusSchema,
  tenantSchema,
  tenantAssignmentSchema,
  validate,
};
