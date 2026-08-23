# Railroad Crossings App

A mobile-friendly dashboard for browsing nationwide railroad crossings and looking up Union Pacific crossings, backed by [Supabase](https://supabase.com/).

## PWA install support

The app now ships with a web app manifest, app icons, and a service worker so it can be installed directly from the browser while native app-store approvals are pending.

- The app now shows a dismissible install banner with **Install**, **Not now**, and **How** actions.
- If install prompting is unavailable, the banner still provides fallback guidance: open the browser menu and choose **Add to Home Screen** (or in iPhone Safari use **Share → Add to Home Screen**).
- The **How** panel includes step-by-step instructions for both **Install on Android** and **Install on iPhone**.
- **Already installed users** – once launched from the home screen in standalone mode, the install prompt/help banner stays hidden.

### Build / run notes for PWA behavior

- The site is still plain HTML + CSS + JavaScript with no build step.
- The service worker only registers on `http://localhost` or HTTPS origins, so use a local static server (`python3 -m http.server 8080`, `npx serve .`, Vercel, or GitHub Pages). It will not register from `file://`.
- Cached assets are limited to the app shell and icons. Supabase/API requests are not aggressively cached, so live data behavior stays unchanged.

### Limitations versus store apps

- Browser install is not the same as App Store / Play Store distribution or discovery.
- iOS installation must be started from Safari and has more platform limits than a native Capacitor build.
- Browser-installed PWAs may have reduced background execution, push/notification support, and device integration compared with store apps.

## Viewing the App

### Option 1 – Live (GitHub Pages)

The app is deployed automatically from the `main` branch via GitHub Pages:

```
https://jdwalker327.github.io/railroad-crossings-app/
```

After a pull request is merged into `main`, GitHub Pages re-deploys within a minute or two. Refresh the page (or do a hard-refresh with **Ctrl + Shift + R** / **Cmd + Shift + R**) to pick up the latest changes.

### Option 2 – Local preview

Because the app is plain HTML + CSS + JavaScript (no build step), you can run it locally with any static file server.

**Python 3** (comes pre-installed on most systems):
```bash
cd railroad-crossings-app
python3 -m http.server 8080
```
Then open **http://localhost:8080** in your browser.

**Node.js / npx:**
```bash
npx serve .
```

> **Note:** The data tables require an active Supabase connection.  
> Supabase credentials are already embedded in `app.js` and work from any origin, so both the live site and your local preview will load real data.

---

## Deploying to Production

"Production" for this app is the GitHub Pages site served from the `main` branch. There is no separate staging environment — merging a pull request into `main` **is** the production deploy.

### Pre-merge checklist

Before promoting, confirm:

- [ ] You have previewed the changes locally (`python3 -m http.server 8080`) or in the PR's branch URL and the app behaves as expected
- [ ] The live Supabase data still loads correctly (DOT and subdivision lookups both return rows)
- [ ] No JavaScript console errors appear in the browser DevTools (F12 → Console)
- [ ] The table is readable on both a desktop browser and a mobile screen width

### Step-by-step promotion

1. **Open the pull request** on GitHub  
   `https://github.com/JDWalker327/railroad-crossings-app/pulls`

2. **Mark it Ready for Review**  
   If the PR is still in *Draft* status, click **"Ready for review"** near the bottom of the PR page. This is required before it can be merged.

3. **Merge into `main`**  
   Click **"Merge pull request"** → **"Confirm merge"**.  
   There is no automated test gate — merging is immediate.

4. **Wait for GitHub Pages to redeploy** (~1–2 minutes)  
   You can watch the deploy status at:  
   `https://github.com/JDWalker327/railroad-crossings-app/deployments`  
   The status changes from *In progress* → *Active* when it's live.

5. **Verify the live site**  
   Open `https://jdwalker327.github.io/railroad-crossings-app/` and do a hard-refresh (**Ctrl + Shift + R** / **Cmd + Shift + R**) to bypass any browser cache.

### Rolling back

GitHub Pages always serves the latest commit on `main`. To roll back:

1. Revert the merge commit on GitHub (`https://github.com/JDWalker327/railroad-crossings-app/commits/main` → find the merge commit → **"Revert"**)
2. Merge the auto-generated revert PR
3. GitHub Pages redeploys automatically within ~1–2 minutes

---

## Screenshots

| Desktop (1280 px) | Mobile (375 px) |
|---|---|
| ![Desktop view](https://github.com/user-attachments/assets/b18e281a-fa4c-48ac-a444-1a48aebe79d7) | ![Mobile view](https://github.com/user-attachments/assets/d0034bce-54df-4c58-886b-dceb95ec8269) |

On mobile, the header controls stack vertically and all buttons/inputs are sized for touch (≥ 44 px). The data table scrolls horizontally so no columns are hidden.

---

## Project Structure

```
index.html   – Page markup
style.css    – All styles, including responsive breakpoints
app.js       – Supabase queries and DOM rendering
sw.js        – Service worker for app-shell caching
manifest.webmanifest – PWA install metadata
```

## Features

- **Railroad browsing** – Browse `public.railroads` with Class I quick-filter tabs and an Other Railroads dropdown
- **Lookup mode** – Search any UP crossing by DOT number or subdivision name
- **Google Maps links** – Open crossing coordinates directly in Google Maps when lat/lon are available
- **Responsive design** – Usable on screens from 320 px wide up to large desktop displays
- **Crossings Map** – Interactive Leaflet map with railroad filter and crossing markers (see below)

---

## Map Feature

Click the **🗺️ Map** button in the app toolbar to open the interactive crossings map.

### Filtering by railroad

The map filter bar lets you narrow visible crossings in two ways:

| Control | What it does |
|---|---|
| **Class I tabs** (BNSF, CN, CPKC, CSX, NS, Union Pacific) | Shows only that railroad's crossings as colored circle markers. Each railroad has a unique color. |
| **Class II dropdown** | Select any non-Class-I carrier from the dropdown to show its crossings. |
| **Show All** button | Resets to all crossings (up to the 5 000-row fetch limit). |

The map automatically fits its view to the visible markers and shows a legend with the selected railroad's color when a filter is active.

### Rendering reliability note

A prior blank-map issue was caused by modal sizing timing during Leaflet initialization. The map now:
- initializes with an OpenStreetMap tile layer and attribution,
- defers `invalidateSize()` until after modal layout has painted, and
- uses an explicit modal/map container height so tiles render reliably on open.

### Track lines

When a railroad is selected, the map is also ready to render **track geometry** (polylines) in the same highlight color. Track GeoJSON data is not yet included in this repo; the extension point is the `getTrackGeometry(railroadKey)` function in `app.js`.

**To add real track data:**
1. Host (or bundle) a GeoJSON FeatureCollection with the shape below.
2. Replace the stub in `getTrackGeometry` with a `fetch()` call or import.

Expected GeoJSON shape:
```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": { "type": "LineString", "coordinates": [[-118.3, 34.1], [-117.9, 34.0]] },
      "properties": { "railroad_key": "up", "subdivision": "Sunset" }
    }
  ]
}
```
