# Friday Night Funkin' Browser Jam

Server-based FNF browser game with themed download portal, online room play, and offline app/source downloads.

## Local play
Run the local server from this folder:

```powershell
npm run server
```

Then open:
- `http://localhost:3000/` for the download portal
- `http://localhost:3000/play` for the online game directly

## Desktop app
Run the Electron app with:

```powershell
npm start
```

## Permanent hosting
Use the deployment notes in `DEPLOY-RENDER.md`.

The project already includes:
- `render.yaml` for a Render web service
- `/health` route for health checks
- `/` as the public landing/download page
- `/play` as the direct online game page

## Notes
- `Sporting` uses imported chart data and original audio/assets from your local VS Matt files.
- `Perseverance` uses imported chart/audio/assets and custom stage/event handling.
- Online multiplayer runs through `server.js` and Socket.IO.
