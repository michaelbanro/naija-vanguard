# Naija Vanguard

A browser-based tactical survival shooter inspired by a simple top-down defense game.

## Run locally

Open `index.html` in a browser. For the online multiplayer host/join flow, serve the project via a local web server or deploy it to GitHub Pages / any HTTPS host.

## Files

- `index.html` — main menu and layout
- `game.js` — game logic, rendering, weapons, waves, and networking
- `admin.html` — config editor for balancing and custom maps/waves

## Notes

- The game uses PeerJS for online room hosting and joining.
- The config is saved in `localStorage` per browser.
- Use the admin panel to tune the game or import/export settings.
