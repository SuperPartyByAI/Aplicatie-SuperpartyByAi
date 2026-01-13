## Manual Smoke Checklist (Evenimente Flow)

### Web (Chrome)
- Open `/#/evenimente`
- Login
- Click an event card → should open **Dovezi**
- In Dovezi:
  - Upload 2 photos in a category (ex: "Nu am intarziat")
  - Wait for upload to finish; thumbnails should appear
  - Refresh the page (F5)
  - Thumbnails must still be visible (loaded from Firestore/Storage URLs)
  - If category is not locked (status != OK), delete a photo → thumbnail disappears

### Mobile (Android emulator/device)
- Open Evenimente
- Click an event card → Dovezi
- Upload photos; verify thumbnails appear
- Kill app / relaunch
- Verify thumbnails still appear (persisted in Firebase)

### AI “Noteaza (AI)” from Evenimente
- On Evenimente, tap **Noteaza (AI)**
- Enter text like:
  - `Notează o petrecere pentru Maria pe 15-02-2026 la București, Str. Exemplu 10, 10 copii, animator + popcorn`
- Submit
- Expected:
  - SnackBar success message
  - New event appears automatically in Evenimente list (no manual refresh)
- Reload app/page
- Event must still be present (Firestore)

### Role assignment stability
- On Evenimente, click a role slot
- Set a pending code (ex: `A123`)
- Reload
- Pending code remains
- Try two quick updates (set code twice quickly) → should not corrupt roles (transaction-based update)

