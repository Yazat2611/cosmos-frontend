# Cosmos Hub frontend

React + Vite interface for the Cosmos Hub backend: upcoming asteroid close approaches, asteroid orbits, and NASA Earth events on a 3D globe.

## Run it

1. Start PostgreSQL and the backend (`Cosmos-Backend`) on port 8080:

   ```bash
   mvn spring-boot:run
   ```

2. Start the frontend:

   ```bash
   npm install
   npm run dev
   ```

3. Open http://localhost:5173.

The Vite dev server proxies `/api` to `http://localhost:8080`, so the backend needs no CORS setup in development. Set `VITE_API_TARGET` to proxy somewhere else. A production build needs `VITE_API_URL` pointing at a backend that allows this site's origin.

## How the data flows

| Screen | Endpoint |
| --- | --- |
| Overview, Close approaches | `GET /api/asteroids/all` |
| Asteroid panel, hazard badges | `GET /api/asteroids/details/{designation}` |
| Earth events | `GET /api/earth-events` |

Hazard status isn't in the approaches list. The app looks up objects with H <= 22 (only those can be potentially hazardous) two at a time, and caches the results in the browser for a week.
