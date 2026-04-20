# Vendor Booth Map System

A hardened, deployable vendor booth map system with localStorage autosave, diagnostics, and error handling.

## Quick Start

1. **Download** all files in the `booth-map-system/` folder
2. **Upload** to GitHub Pages, Cloudflare Pages, or Netlify
3. **Open** the site in your browser
4. **Click** "Toggle Diagnostics" to verify everything loaded

## File Structure

```
booth-map-system/
├── index.html              # Main page (don't edit)
├── styles.css              # Styles (don't edit)
├── app.js                  # App logic (don't edit)
├── README.md               # This file
├── data/
│   ├── categories.json     # Category colors
│   ├── events.json         # Event configuration
│   ├── event-offstreet.json
│   ├── event-territorial.json
│   ├── event-bluegrass.json
│   ├── event-laborday.json
│   └── event-fallshow.json
└── maps/
    ├── offstreet.svg       # OFFStreet map
    └── plaza.svg           # Plaza map (shared)
```

## If the Map is Blank

1. **Click "Toggle Diagnostics"** in the sidebar
2. Check what it says:
   - **"Map Loaded: ✗ No"** → The SVG file is missing or path is wrong
   - **"Matched: 0"** → Booth IDs in SVG don't match JSON
   - **Error message** → Read the specific error

### Common Fixes

| Problem | Solution |
|---------|----------|
| Map file not found | Ensure SVG is in `maps/` folder |
| No booths match | Check booth IDs match between SVG and JSON |
| Wrong event showing | Select correct event from dropdown |

## How to Replace a Map SVG

1. **Create your SVG** with booth shapes
2. **Save it** to the `maps/` folder (e.g., `maps/myevent.svg`)
3. **Update `data/events.json`**:
   ```json
   "myevent": {
     "id": "myevent",
     "name": "My Event",
     "mapFile": "./maps/myevent.svg",
     "dataFile": "./data/event-myevent.json"
   }
   ```
4. **Create `data/event-myevent.json`** with booth data
5. **Add to dropdown** in `index.html`

## SVG Booth Requirements

For booths to work, your SVG must have:

```xml
<rect id="booth-42" class="booth" x="100" y="100" width="50" height="50"/>
<text class="booth-label" x="125" y="125">42</text>
```

### Booth ID Formats (All Work)

The app normalizes these automatically:
- `id="booth-42"` ✓
- `id="booth_42"` ✓
- `id="Booth-42"` ✓
- `id="42"` ✓
- `id="A1"` ✓
- `id="booth-A1"` ✓

### Important
- Must have `class="booth"`
- ID must be unique
- For double booths: `id="booth-45/46"`

## How Autosave Works

1. **Edit a booth** → Changes save to browser automatically
2. **Close browser** → Changes are still there
3. **Come back later** → Your changes load automatically
4. **Export JSON** → Creates a backup file

### Reset to Original

Click **"Reset to Original"** to discard all changes and reload from the original JSON file.

## Export / Import / Reset

### Export
1. Click **"Export JSON"**
2. File downloads: `event-offstreet-2026-04-17.json`
3. Keep this as a backup

### Import
1. Click **"Import JSON"**
2. Select a previously exported JSON file
3. Current event data is replaced

### Reset
1. Click **"Reset to Original"**
2. Confirm the warning
3. All changes discarded, original data restored

## How to Upload to Static Hosting

### GitHub Pages (Free)

1. Go to github.com and create an account
2. Click "New Repository"
3. Name it `booth-maps`
4. Click "Upload files"
5. Drag all files from the booth-map-system folder
6. Click "Commit changes"
7. Go to Settings → Pages
8. Under "Source", select "Deploy from a branch"
9. Select "main" branch, "/ (root)" folder
10. Click Save
11. Wait 2-3 minutes
12. Visit `https://yourusername.github.io/booth-maps`

### Cloudflare Pages (Free)

1. Go to pages.cloudflare.com
2. Sign up / Log in
3. Click "Create a project"
4. Select "Upload assets"
5. Drag your booth-map-system folder
6. Click "Deploy site"
7. Get instant live URL

### Netlify (Free - Easiest)

1. Go to netlify.com
2. Drag your booth-map-system folder onto the page
3. Get instant live URL

## Troubleshooting

### "Failed to load map"
- Check the SVG file exists in `maps/` folder
- Check filename matches what's in `events.json`
- Use browser console (F12) for details

### "No booths matched"
- Open Diagnostics panel
- Compare "SVG Booths" vs "JSON Booths"
- Check that booth IDs are the same format

### Changes not saving
- Check browser allows localStorage
- Try a different browser
- Export JSON as backup

### Map too big/small
- Click **"Fit Map to View"** button
- Or scroll to zoom in the map area

## Category Colors

Edit `data/categories.json` to change colors:

```json
"Jewelry": {
  "color": "#E91E63",
  "bgColor": "#FCE4EC",
  "borderColor": "#C2185B"
}
```

- `bgColor` = booth fill color
- `borderColor` = booth outline color

## Data Format

### Booth Object
```json
{
  "boothId": "42",
  "vendorName": "John Smith",
  "businessName": "Smith Jewelry",
  "vendorCategory": "Jewelry",
  "boothStatus": "assigned",
  "boothSize": "10x10",
  "phone": "555-1234",
  "email": "john@example.com",
  "notes": "Needs electricity"
}
```

### Status Values
- `open` - Available
- `assigned` - Has vendor
- `hold` - Temporarily reserved
- `unavailable` - Cannot use

## Support

This is a static web app. No server required. All data stays in your browser unless you export it.

For issues:
1. Check Diagnostics panel
2. Check browser console (F12)
3. Verify file paths
4. Ensure booth IDs match
