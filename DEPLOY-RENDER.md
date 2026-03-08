# Deploy FNF Browser Jam

This project is ready to deploy as a Node web service.

## Best option
Use a hosted browser URL for friends.

Why:
- The browser link avoids Microsoft SmartScreen warnings on the unsigned `.exe`.
- Online rooms already run through the Node + Socket.IO server in `server.js`.
- A Render web service gives you one stable `onrender.com` URL.

## Render setup
1. Put this folder in a GitHub repo.
2. Go to Render and create a new Blueprint or Web Service from that repo.
3. Render will detect `render.yaml`.
4. Deploy.
5. After deploy finishes, share the root URL with friends.

## URLs after deploy
- `/` opens the themed download portal.
- `/play` opens the online game directly.
- `/health` is the health check endpoint.

## What friends should use
- Best path: the hosted browser URL.
- If they want downloads, send them the root URL and let them choose online or offline.
- If Microsoft warns about the app, that is SmartScreen reacting to an unsigned executable, not a problem with the browser version.

## Local testing
Run this from the project folder:

```powershell
npm run server
```

Then open:
- `http://localhost:3000/`
- `http://localhost:3000/play`
