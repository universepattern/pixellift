# PixelLift

A static browser app for quick image cleanup. Upload an image, select unwanted marks or lines with brush, box, wand selection, or detected element selection, then delete the selected area. The app runs fully in the browser and does not upload images to a server.

## Element detection

Use **Detect elements** to separate visually distinct pixel groups by contrast and color attributes. After detection, switch to **Elements** and click a detected group to select it for deletion. Lower **Element sensitivity** if too few parts are found; raise it if the app selects too much texture.

## Run locally

Open `index.html` in a browser.

## Free hosting on GitHub Pages

1. Create a new GitHub repository.
2. Upload `index.html`, `styles.css`, `app.js`, and this `README.md`.
3. In GitHub, open **Settings > Pages**.
4. Set **Source** to **Deploy from a branch**.
5. Choose the `main` branch and `/root`, then save.

GitHub will publish the app at a `github.io` URL.
