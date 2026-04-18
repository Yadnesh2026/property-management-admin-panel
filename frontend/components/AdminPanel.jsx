"use client";

import { useEffect, useState } from "react";
import {
  assignTenant,
  createBed,
  createFlat,
  createRoom,
  createTenant,
  deleteBed,
  deleteFlat,
  deleteRoom,
  deleteTenant,
  fetchAllData,
  unassignTenant,
  updateBedStatus,
} from "../lib/api";

const initialFlat = { name: "", address: "" };
const initialRoom = { flat_id: "", name: "", max_bed_capacity: "" };
const initialBed = { room_id: "", name: "", status: "available" };
const initialTenant = { full_name: "", email: "", phone: "", bed_id: "" };

function percent(occupied, total) {
  if (!Number(total)) {
    return "0%";
  }

  return `${Math.round((Number(occupied) / Number(total)) * 100)}%`;
}

export default function AdminPanel() {
  const [data, setData] = useState({
    flats: [],
    rooms: [],
    beds: [],
    tenants: [],
    occupancy: { flats: [], rooms: [] },
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [flatForm, setFlatForm] = useState(initialFlat);
  const [roomForm, setRoomForm] = useState(initialRoom);
  const [bedForm, setBedForm] = useState(initialBed);
  const [tenantForm, setTenantForm] = useState(initialTenant);
  const [reassignments, setReassignments] = useState({});

  async function loadData() {
    try {
      setLoading(true);
      setError("");
      setData(await fetchAllData());
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleAction(action, successMessage) {
    try {
      setError("");
      setNotice("");
      await action();
      if (successMessage) {
        setNotice(successMessage);
      }
      await loadData();
    } catch (actionError) {
      setError(actionError.message);
    }
  }

  async function handleFlatSubmit(event) {
    event.preventDefault();
    await handleAction(async () => {
      await createFlat(flatForm);
      setFlatForm(initialFlat);
    }, "Flat created.");
  }

  async function handleRoomSubmit(event) {
    event.preventDefault();
    await handleAction(async () => {
      await createRoom(roomForm);
      setRoomForm(initialRoom);
    }, "Room created.");
  }

  async function handleBedSubmit(event) {
    event.preventDefault();
    await handleAction(async () => {
      await createBed(bedForm);
      setBedForm(initialBed);
    }, "Bed created.");
  }

  async function handleTenantSubmit(event) {
    event.preventDefault();
    await handleAction(async () => {
      await createTenant({
        ...tenantForm,
        bed_id: tenantForm.bed_id || undefined,
      });
      setTenantForm(initialTenant);
    }, "Tenant created.");
  }

  async function handleFlatDelete(id) {
    try {
      setError("");
      setNotice("");
      await deleteFlat(id, false);
      setNotice("Flat deleted.");
      await loadData();
    } catch (deleteError) {
      if (deleteError.message.includes("force=true")) {
        const confirmed = window.confirm(
          "This flat has active tenant assignments. Click OK to confirm permanent deletion."
        );

        if (!confirmed) {
          return;
        }

        await handleAction(() => deleteFlat(id, true), "Flat deleted after confirmation.");
        return;
      }

      setError(deleteError.message);
    }
  }

  if (loading) {
    return <main className="page-shell">Loading admin panel...</main>;
  }

  const availableBeds = data.beds.filter((bed) => bed.status === "available");

  return (
    <main className="page-shell">
      <section className="hero">
        <p className="eyebrow">Intern Assignment Demo</p>
        <h1>Property Management Admin Panel</h1>
        <p className="hero-copy">
          Manage the full hierarchy from flats to tenant assignments with backend-enforced business rules.
        </p>
      </section>

      {error ? <p className="message error">{error}</p> : null}
      {notice ? <p className="message success">{notice}</p> : null}

      <section className="grid two-up">
        <div className="card">
          <h2>Create Flat</h2>
          <form onSubmit={handleFlatSubmit} className="form-grid">
            <input
              placeholder="Flat name"
              value={flatForm.name}
              onChange={(event) => setFlatForm({ ...flatForm, name: event.target.value })}
            />
            <input
              placeholder="Address"
              value={flatForm.address}
              onChange={(event) => setFlatForm({ ...flatForm, address: event.target.value })}
            />
            <button type="submit">Add Flat</button>
          </form>
        </div>

        <div className="card">
          <h2>Create Room</h2>
          <form onSubmit={handleRoomSubmit} className="form-grid">
            <select
              value={roomForm.flat_id}
              onChange={(event) => setRoomForm({ ...roomForm, flat_id: event.target.value })}
            >
              <option value="">Select flat</option>
              {data.flats.map((flat) => (
                <option key={flat.id} value={flat.id}>
                  {flat.name}
                </option>
              ))}
            </select>
            <input
              placeholder="Room name"
              value={roomForm.name}
              onChange={(event) => setRoomForm({ ...roomForm, name: event.target.value })}
            />
            <input
              type="number"
              min="1"
              placeholder="Max capacity"
              value={roomForm.max_bed_capacity}
              onChange={(event) =>
                setRoomForm({ ...roomForm, max_bed_capacity: event.target.value })
              }
            />
            <button type="submit">Add Room</button>
          </form>
        </div>
      </section>

      <section className="grid two-up">
        <div className="card">
          <h2>Create Bed</h2>
          <form onSubmit={handleBedSubmit} className="form-grid">
            <select
              value={bedForm.room_id}
              onChange={(event) => setBedForm({ ...bedForm, room_id: event.target.value })}
            >
              <option value="">Select room</option>
              {data.rooms.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.flat_name} - {room.name}
                </option>
              ))}
            </select>
            <input
              placeholder="Bed name"
              value={bedForm.name}
              onChange={(event) => setBedForm({ ...bedForm, name: event.target.value })}
            />
            <select
              value={bedForm.status}
              onChange={(event) => setBedForm({ ...bedForm, status: event.target.value })}
            >
              <option value="available">Available</option>
              <option value="under_maintenance">Under Maintenance</option>
            </select>
            <button type="submit">Add Bed</button>
          </form>
        </div>

        <div className="card">
          <h2>Create Tenant</h2>
          <form onSubmit={handleTenantSubmit} className="form-grid">
            <input
              placeholder="Tenant full name"
              value={tenantForm.full_name}
              onChange={(event) =>
                setTenantForm({ ...tenantForm, full_name: event.target.value })
              }
            />
            <input
              placeholder="Email"
              value={tenantForm.email}
              onChange={(event) => setTenantForm({ ...tenantForm, email: event.target.value })}
            />
            <input
              placeholder="Phone"
              value={tenantForm.phone}
              onChange={(event) => setTenantForm({ ...tenantForm, phone: event.target.value })}
            />
            <select
              value={tenantForm.bed_id}
              onChange={(event) => setTenantForm({ ...tenantForm, bed_id: event.target.value })}
            >
              <option value="">Create without assignment</option>
              {availableBeds.map((bed) => (
                <option key={bed.id} value={bed.id}>
                  {bed.flat_name} - {bed.room_name} - {bed.name}
                </option>
              ))}
            </select>
            <button type="submit">Add Tenant</button>
          </form>
        </div>
      </section>

      <section className="card">
        <h2>Occupancy Dashboard</h2>
        <div className="grid two-up">
          <div>
            <h3>By Flat</h3>
            <div className="list-stack">
              {data.occupancy.flats.map((flat) => (
                <div key={flat.id} className="list-row">
                  <div>
                    <strong>{flat.name}</strong>
                    <p>
                      {flat.occupied_beds} of {flat.total_beds} beds occupied
                    </p>
                  </div>
                  <span className="badge">{percent(flat.occupied_beds, flat.total_beds)}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h3>By Room</h3>
            <div className="list-stack">
              {data.occupancy.rooms.map((room) => (
                <div key={room.id} className="list-row">
                  <div>
                    <strong>
                      {room.flat_name} - {room.name}
                    </strong>
                    <p>
                      {room.occupied_beds} of {room.total_beds} beds occupied
                    </p>
                  </div>
                  <span className="badge">{percent(room.occupied_beds, room.total_beds)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="card">
        <h2>Flats</h2>
        <div className="list-stack">
          {data.flats.map((flat) => (
            <div key={flat.id} className="list-row">
              <div>
                <strong>{flat.name}</strong>
                <p>{flat.address}</p>
                <p>
                  Rooms: {flat.room_count} | Beds: {flat.bed_count} | Occupied: {flat.occupied_beds}
                </p>
              </div>
              <button className="button-ghost" onClick={() => handleFlatDelete(flat.id)}>
                Delete
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>Rooms</h2>
        <div className="list-stack">
          {data.rooms.map((room) => (
            <div key={room.id} className="list-row">
              <div>
                <strong>
                  {room.flat_name} - {room.name}
                </strong>
                <p>
                  Capacity: {room.max_bed_capacity} | Beds: {room.current_bed_count} | Occupied:{" "}
                  {room.occupied_bed_count}
                </p>
              </div>
              <button
                className="button-ghost"
                onClick={() => handleAction(() => deleteRoom(room.id), "Room deleted.")}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>Beds</h2>
        <div className="list-stack">
          {data.beds.map((bed) => (
            <div key={bed.id} className="list-row">
              <div>
                <strong>
                  {bed.flat_name} - {bed.room_name} - {bed.name}
                </strong>
                <p>Status: {bed.status}</p>
                <p>{bed.tenant_name ? `Assigned to ${bed.tenant_name}` : "No active tenant"}</p>
              </div>
              <div className="action-row">
                <select
                  value={bed.status}
                  onChange={(event) =>
                    handleAction(
                      () => updateBedStatus(bed.id, event.target.value),
                      "Bed status updated."
                    )
                  }
                >
                  <option value="available">Available</option>
                  <option value="under_maintenance">Under Maintenance</option>
                  <option value="occupied" disabled>
                    Occupied
                  </option>
                </select>
                <button
                  className="button-ghost"
                  onClick={() => handleAction(() => deleteBed(bed.id), "Bed deleted.")}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>Tenants</h2>
        <div className="list-stack">
          {data.tenants.map((tenant) => (
            <div key={tenant.id} className="list-row tenant-row">
              <div>
                <strong>{tenant.full_name}</strong>
                <p>{tenant.email || "No email provided"}</p>
                <p>
                  {tenant.flat_name
                    ? `${tenant.flat_name} - ${tenant.room_name} - ${tenant.bed_name}`
                    : "Not assigned to any bed"}
                </p>
              </div>
              <div className="action-row">
                <select
                  value={reassignments[tenant.id] || ""}
                  onChange={(event) =>
                    setReassignments({
                      ...reassignments,
                      [tenant.id]: event.target.value,
                    })
                  }
                >
                  <option value="">Select bed</option>
                  {availableBeds.map((bed) => (
                    <option key={bed.id} value={bed.id}>
                      {bed.flat_name} - {bed.room_name} - {bed.name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() =>
                    handleAction(
                      () => assignTenant(tenant.id, reassignments[tenant.id]),
                      "Tenant assignment updated."
                    )
                  }
                >
                  Assign / Move
                </button>
                <button
                  className="button-ghost"
                  onClick={() => handleAction(() => unassignTenant(tenant.id), "Tenant unassigned.")}
                >
                  Remove Bed
                </button>
                <button
                  className="button-ghost"
                  onClick={() => handleAction(() => deleteTenant(tenant.id), "Tenant deleted.")}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
