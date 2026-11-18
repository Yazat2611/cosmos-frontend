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
| Solar system (orbits of the closest and hazardous approaches) | `GET /api/asteroids/all`, then `GET /api/asteroids/details/{designation}` for up to 40 objects |
| Asteroid panel, hazard badges | `GET /api/asteroids/details/{designation}` |
| Earth events | `GET /api/earth-events` |

Hazard status isn't in the approaches list. The app looks up objects with H <= 22 (only those can be potentially hazardous) two at a time, and caches the results in the browser for a week.

## Solar system explorer

`#/explorer` is an interactive 3D view of the solar system built with three.js (`@react-three/fiber` and `drei`). Planets move on JPL's approximate Keplerian elements (valid 1800–2050); asteroids use the SBDB elements the backend returns. A built-in set of well-known asteroids (Apophis, Bennu, Ceres and others) is always shown, so the view works with the backend offline; their elements are rounded, so their positions are illustrative. The main belt is a decorative, seeded field.

Click a body or pick it from the list to fly to it. The strip along the bottom is a timeline of upcoming close approaches from the backend (or the closest passes of the sample orbits when it's offline); clicking one jumps to that date. Space pauses time, the arrows change speed and direction, and the date field jumps to any day. Asteroid and planet panels chart the distance from Earth over a year. The 3D code is lazy-loaded, so other pages don't pay for it.

## Earth events globe

`#/earth` is a full-screen 3D globe (three.js, lazy-loaded) built from `GET /api/earth-events`. Land is drawn as a dot matrix from the same outline the Overview map uses, and the lit side follows the real position of the Sun. Events pulse in their category colour; storms and drifting ice show their reported track. Filter by category, open an event for its details (storms get a wind chart with category 1 and 4 thresholds), or switch to **Replay** to play the last few weeks back day by day.
