const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : null;

  if (!response.ok) {
    throw new Error(payload?.message || "Request failed.");
  }

  return payload;
}

export async function fetchAllData() {
  const [flats, rooms, beds, tenants, occupancy] = await Promise.all([
    request("/api/flats"),
    request("/api/rooms"),
    request("/api/beds"),
    request("/api/tenants"),
    request("/api/occupancy"),
  ]);

  return { flats, rooms, beds, tenants, occupancy };
}

export async function createFlat(payload) {
  return request("/api/flats", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function deleteFlat(id, force = false) {
  return request(`/api/flats/${id}?force=${force}`, {
    method: "DELETE",
  });
}

export async function createRoom(payload) {
  return request("/api/rooms", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function deleteRoom(id) {
  return request(`/api/rooms/${id}`, {
    method: "DELETE",
  });
}

export async function createBed(payload) {
  return request("/api/beds", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateBedStatus(id, status) {
  return request(`/api/beds/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export async function deleteBed(id) {
  return request(`/api/beds/${id}`, {
    method: "DELETE",
  });
}

export async function createTenant(payload) {
  return request("/api/tenants", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function assignTenant(id, bedId) {
  return request(`/api/tenants/${id}/assignment`, {
    method: "PATCH",
    body: JSON.stringify({ bed_id: bedId }),
  });
}

export async function unassignTenant(id) {
  return request(`/api/tenants/${id}/assignment`, {
    method: "DELETE",
  });
}

export async function deleteTenant(id) {
  return request(`/api/tenants/${id}`, {
    method: "DELETE",
  });
}
