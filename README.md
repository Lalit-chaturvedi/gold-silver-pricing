# Gold · Silver Price Tracker

Live MCX market price tracker for Gold and Silver built with React + Vite.

---

## Prerequisites

Make sure you have these installed before starting:

- [Node.js](https://nodejs.org/) v18 or higher
- npm (comes with Node.js)

Check your versions:
```bash
node -v
npm -v
```

---

## Running Locally

### Step 1 — Install dependencies

```bash
npm install
```

### Step 2 — Start the dev server

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## Configuring Live Data (Optional)

By default the app runs in **Demo mode** with simulated prices.

To get real MCX prices:

1. Sign up at [5paisa Developer Portal](https://dev.5paisa.com/)
2. Get your **Vendor Key** and **Access Token**
3. Click **Admin** in the app (password: `admin@123`)
4. Enter your credentials and save

> ⚠️ Change the admin password in `App.jsx` before deploying:
> ```js
> const ADMIN_CREDENTIALS = { username: "admin", password: "YOUR_PASSWORD" };
> ```

---

## Building for Production

```bash
npm run build
```

This generates a `dist/` folder with all static files ready to deploy.

To preview the production build locally before deploying:
```bash
npm run preview
```

---

## Deploying to Hostinger

### Option A — File Manager (Easiest)

1. Log in to [Hostinger hPanel](https://hpanel.hostinger.com/)
2. Go to **Files → File Manager**
3. Open the `public_html` folder
4. Click **Upload** and upload all files **inside** your `dist/` folder
   > Upload the *contents* of `dist/`, not the folder itself
5. Your site is live at your domain ✅

### Option B — FTP Upload

1. In hPanel go to **Files → FTP Accounts**
2. Note your FTP **hostname**, **username**, and **password**
3. Open [FileZilla](https://filezilla-project.org/) (free FTP client)
4. Connect using your credentials
5. Navigate to `public_html/` on the remote side
6. Drag and drop all contents of your local `dist/` folder into `public_html/`

### Fix Page Refresh 404 (Required)

Create a file called `.htaccess` inside `public_html/` with this content:

```apache
Options -MultiViews
RewriteEngine On
RewriteCond %{REQUEST_FILENAME} !-f
RewriteRule ^ index.html [QR,L]
```

This prevents 404 errors when the page is refreshed.

---

## Updating the Site

Every time you make changes to the code:

```bash
# 1. Make your changes in src/App.jsx
# 2. Build
npm run build
# 3. Upload the new dist/ contents to public_html/ on Hostinger
```

---

## Project Structure

```
gold-silver-tracker/
├── index.html          ← Entry HTML (add viewport + reset styles here)
├── src/
│   ├── main.jsx        ← React root (no CSS imports)
│   └── App.jsx         ← Main app (gold-silver-tracker.jsx goes here)
├── dist/               ← Generated after npm run build (upload this to Hostinger)
└── package.json
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `EPERM: process.cwd failed` | Your terminal's folder was deleted. Run `cd ~` then redo the steps. |
| App only fills half the screen | Make sure `src/index.css` is deleted and the `<style>` reset is in `index.html` |
| Prices not updating | Check your 5paisa API key in Admin panel, or check browser console for errors |
| 404 on page refresh (Hostinger) | Add the `.htaccess` file to `public_html/` as shown above |
| Build fails | Run `npm install` again, then `npm run build` |

---

## Admin Credentials

| Field | Default |
|---|---|
| Username | `admin` |
| Password | `admin@123` |

> Change these in `src/App.jsx` before going live.
