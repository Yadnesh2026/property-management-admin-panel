# Property Management Admin Panel

A full-stack intern assignment project built with:

- Frontend: Next.js
- Backend: Express.js
- Database: PostgreSQL via Supabase

This app manages a strict hierarchy:

`Flat -> Room -> Bed -> Tenant`

The main focus is backend correctness:

- room capacity cannot be exceeded
- under-maintenance or occupied beds cannot be assigned
- a tenant can only have one active bed assignment
- reassigning a tenant frees the previous bed automatically
- flats with active assignments require explicit delete confirmation
- tenants cannot be deleted while assigned

## Project Structure

```text
backend/
  db.js
  schema.sql
  server.js
  services.js
  validators.js

frontend/
  app/
  components/
  lib/
```

## Why This Structure

If you come from MERN, think of it like this:

- `backend/server.js` = your Express app entry file
- `backend/services.js` = controller + business-logic layer
- `backend/validators.js` = request validation layer
- `backend/schema.sql` = SQL version of Mongoose schemas
- `frontend/app/page.js` = main Next.js route
- `frontend/components/AdminPanel.jsx` = your React UI

So this is still close to MERN thinking. The main difference is:

- instead of Mongo collections, you use related SQL tables
- instead of React + Vite, Next.js gives you the frontend app structure

## Environment Variables

### Backend

Create `backend/.env` from `backend/.env.example`

```env
PORT=4000
FRONTEND_URL=http://localhost:3000
DATABASE_URL=postgresql://postgres:password@db.host.supabase.co:5432/postgres
DB_SSL=true
```

### Frontend

Create `frontend/.env.local` from `frontend/.env.local.example`

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
```

## Supabase Setup

1. Create a new Supabase project.
2. Open the SQL editor in Supabase.
3. Copy the contents of [backend/schema.sql](backend/schema.sql) and run it.
4. Go to Supabase project settings and copy the Postgres connection string.
5. Put that value into `backend/.env` as `DATABASE_URL`.

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Add the backend and frontend env files.

3. Start both apps:

```bash
npm run dev
```

4. Open:

- Frontend: [http://localhost:3000](http://localhost:3000)
- Backend: [http://localhost:4000/health](http://localhost:4000/health)

## Step-by-Step Explanation For You

### 1. PostgreSQL mindset vs MongoDB

In MongoDB, you often keep nested or loosely related documents.

In PostgreSQL, we model the hierarchy with foreign keys:

- `rooms.flat_id -> flats.id`
- `beds.room_id -> rooms.id`
- `tenants.active_bed_id -> beds.id`

That is the SQL replacement for nested ownership.

### 2. Why tenant is linked to a bed

The assignment says a tenant must belong to a specific bed, not directly to a room or flat.

So the tenant table stores `active_bed_id`.

From that one field, we can reach:

- tenant -> bed
- bed -> room
- room -> flat

### 3. Where business logic lives

All important rules are enforced in [backend/services.js](/C:/Users/DELL/Documents/New%20project/backend/services.js), not just in the frontend.

Examples:

- `createBed()` checks room capacity before inserting
- `assignTenant()` blocks occupied and maintenance beds
- `assignTenant()` also frees the previous bed automatically
- `deleteFlat()` refuses deletion unless explicit confirmation is passed

This is exactly what the assignment wants.

### 4. Why transactions are used

Tenant reassignment changes multiple records:

- old bed becomes `available`
- new bed becomes `occupied`
- tenant gets new `active_bed_id`

Those steps must succeed together, so the backend uses a database transaction in `withTransaction()`.

If one step fails, everything rolls back.

### 5. Next.js mindset vs React SPA

If you know React already, Next.js here is not very different:

- `frontend/app/layout.js` = app wrapper
- `frontend/app/page.js` = route page
- `frontend/components/AdminPanel.jsx` = your main client component

So for this project, you can think of Next.js as "React with structure already provided."

## Main API Endpoints

### Flats

- `GET /api/flats`
- `POST /api/flats`
- `DELETE /api/flats/:id?force=true`

### Rooms

- `GET /api/rooms`
- `POST /api/rooms`
- `DELETE /api/rooms/:id`

### Beds

- `GET /api/beds`
- `POST /api/beds`
- `PATCH /api/beds/:id/status`
- `DELETE /api/beds/:id`

### Tenants

- `GET /api/tenants`
- `POST /api/tenants`
- `PATCH /api/tenants/:id/assignment`
- `DELETE /api/tenants/:id/assignment`
- `DELETE /api/tenants/:id`

### Dashboard

- `GET /api/occupancy`

## Deployment Plan

### Backend

Deploy `backend/server.js` to Railway or Render.

Set env vars there:

- `DATABASE_URL`
- `FRONTEND_URL`
- `PORT`
- `DB_SSL=true`

### Frontend

Deploy the repo to Vercel.

Set:

- `NEXT_PUBLIC_API_BASE_URL=https://your-backend-url`

## What To Add Before Submission

Because live credentials are not available in this workspace, you still need to:

1. create the Supabase project
2. run the SQL schema
3. add your real env values
4. deploy frontend and backend
5. update this README with your GitHub repo and live links

## Suggested Demo Flow

1. Create a flat
2. Create a room under that flat
3. Add beds until capacity is reached
4. Create a tenant and assign a bed
5. Reassign the tenant to another bed
6. Show the old bed becoming available automatically
7. Try deleting the tenant while assigned
8. Try deleting the flat without confirmation

That sequence shows almost every important rule in the assignment.
