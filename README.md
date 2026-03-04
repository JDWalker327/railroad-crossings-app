# Railroad Crossings App

A mobile-friendly dashboard for viewing and managing railroad crossing projects, backed by [Supabase](https://supabase.com/).

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
```

## Features

- **Projects mode** – Filter crossings by subdivision; rows highlighted yellow (completed) or green (asphalted)
- **Lookup mode** – Search any UP crossing by DOT number or subdivision name
- **Google Maps links** – DOT numbers link directly to the crossing location when lat/lon are available
- **Responsive design** – Usable on screens from 320 px wide up to large desktop displays
