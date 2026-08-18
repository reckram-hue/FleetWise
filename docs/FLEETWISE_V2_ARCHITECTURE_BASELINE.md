# FleetWise V2 — Architecture Baseline

> Established by Work Package 2 (architecture consolidation). This document records the
> **current** authoritative runtime and the known legacy/duplicate paths. It contains no secrets.

## Active frontend
- **React 19 + Vite 6**, TypeScript.
- Entry: `index.html` → `/src/index.tsx` → `src/App.tsx`.
- Routing: `react-router-dom` **HashRouter** (no server-side routing needed).
- Dev/prod scripts: `npm run dev` (Vite), `npm run build` (`vite build`), `npm run preview`.

## Active database
- **Firestore** (project `fleetwise-9ab3a`, per `.firebaserc`).
- The React app reads/writes Firestore **directly from the client** via `src/services/firebaseApi.ts`.

## Firebase initialization
- `src/lib/firebase.ts` — reads `VITE_FIREBASE_*` env vars, initializes Firestore with
  persistent local cache + long polling; exports `db`, `auth`, `storage`.
- `src/lib/firebaseHealth.ts` — writes/reads a `fw_health/probe` document (admin health check).

## Current authentication
- **Admin**: Firebase Auth email/password (`AdminLogin.tsx`), then role check against the `users` collection.
- **Driver**: 4-digit PIN, hashed with bcrypt, but **validated client-side** in
  `firebaseApi.validateDriverPin` (the hash is read into the browser and compared there).
  This is a known weakness to be addressed in a later work package (server-side validation exists
  in Cloud Functions but is not yet wired in).

## Cloud Functions (current role)
- `functions/src/index.ts` implements the **correct** secure/transactional operations:
  `startShiftWithPin`, `endShift`, `validateDriverPin`, `driverChangePin`,
  `adminSetDriverPin`, `getActiveShift` — with zod validation, bcrypt, rate limiting, and
  Firestore transactions using `activeShiftId` pointers on driver + vehicle.
- **Not called by the frontend today.** These are retained (KEEP) for later integration.

## Express / Telegram server (current role)
- `server/src/index.js` (Node + Express + Telegraf) provides: Telegram bot
  (scan QR via photo, OCR odometer via tesseract.js, `/status`, `/endshift`, `/mystats`),
  a JSON-file persistence layer (`server/data/*.json`), and a small REST API
  (`/health`, `/api/vehicles`, `/api/drivers`, `/api/shifts`).
- **The React app does not use this server.** Normal FleetWise operation (drivers, vehicles,
  shifts, admin, Firestore) does **not** require it.
- It is the only home of Telegram integration today. It is a **local development utility** and
  currently a blocker for a fully hosted PWA (it needs a long-running Node process; the Vercel
  static build does not run it, and `vercel.json` routes `/health` to `localhost:5174`, which
  cannot work in production).

## Active service layer
- `src/services/firebaseApi.ts` — the single active service layer (imported by ~21 components).
- `src/services/mockApi.ts` and `src/services/api.ts` were **dead** and are now quarantined
  (see below).

## Legacy / quarantined code
Moved to `legacy/` (Git history preserved; not part of the runtime):
- `legacy/services/` — `mockApi.ts`, `api.ts` (dead service layers).
- `legacy/scripts/` — one-off fix/deploy scripts and batch files
  (`fix-*.js/.cjs/.html`, `deploy*.ps1`, `repair-firebase.ps1`, `*.bat`).
- `legacy/docs/` — one-off setup/fix/debug guides.
- `legacy/test-telegram.html` — debug page.
- `legacy/` is excluded from the TypeScript build (`tsconfig.json` `exclude`).

## localStorage role
- `src/store/shift.ts` — persists an active-shift object under key `fleetwise_active_shift`.
  **RISKY DUPLICATE STATE** (can contradict Firestore). To be made UI/session-only or removed later.
- `src/components/auth/DriverPinLogin.tsx` — stores `fleetwise_device_id`.
  **SAFE UI CACHE** (device identifier for rate limiting).

## Known duplicate / competing paths
- **Shifts + PIN auth**: direct Firestore writes (`firebaseApi`) **vs** Cloud Functions
  (`functions/src/index.ts`) — two implementations, two different shift field schemas.
- **Dependency resolution**: `index.html` contains a legacy **CDN importmap** (aistudiocdn.com)
  that duplicates React/lucide/recharts which are also bundled via `package.json`.
- **Firestore rules**: `firestore.rules` (root, **deployed** per `firebase.json`) and
  `firebase/firestore.rules` (unused duplicate, different content). Both are permissive
  development rules (`allow read, write: if true`).
- **Shift UI**: `src/pages/ShiftStart.tsx` / `src/pages/ActiveShift.tsx` (active) vs a dead
  `StartShiftFlow` / `EndShiftFlow` inside `src/components/driver/DriverDashboard.tsx`.

## Current build status (WP2 baseline)
- TypeScript (`tsc --noEmit`): **21 errors** after quarantine (was 23; the 2 `mockApi.ts`
  errors left with the quarantine). See WP3 for the fix list.
- Production build (`vite build`): not executed in the audit sandbox (esbuild child-process is
  blocked by the environment). CI runs `vite build` but does **not** run `tsc`.
- Tests: none present. Lint: none configured.
