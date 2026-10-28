# 🌿 Jagori Tree Tracker - Official User Manual
**A Guide to Installation, Features & Field Operations**  
*Jagori Charitable Trust • Tree Conservation & Verification Registry*

---

## 📌 1. Official App Link & Installation

The application is deployed live in the cloud and accessible globally:  
👉 **Official Link:** **[https://jagori-tree-app.vercel.app](https://jagori-tree-app.vercel.app)**

You do not need to download files from an app store. You can install it directly onto any phone, tablet, or computer in seconds as a **Progressive Web App (PWA)**.

---

### 📱 Installing on Android Phones (Google Chrome)
1. Open **Google Chrome** on your Android phone.
2. Go to: **`https://jagori-tree-app.vercel.app`**
3. Tap the **three vertical dots (⋮)** in the top-right corner.
4. Tap **"Install app"** (or **"Add to Home Screen"**).
5. Tap **Install** when prompted.
6. The **Jagori Tree Tracker** icon will now appear on your phone's home screen.  
   *(It launches full-screen like a regular native app without browser bars).*

---

### 🍏 Installing on iPhones & iPads (Apple Safari)
1. Open **Safari** on your iPhone or iPad.
2. Go to: **`https://jagori-tree-app.vercel.app`**
3. Tap the **Share button** at the bottom (the square with an arrow pointing upward ⬆️).
4. Scroll down the menu and tap **"Add to Home Screen"**.
5. Tap **Add** in the top-right corner.
6. The app is installed on your iPhone home screen with the official Jagori emblem.

---

### 💻 Installing on Windows PC / Laptop
1. Open **Google Chrome** or **Microsoft Edge**.
2. Go to: **`https://jagori-tree-app.vercel.app`**
3. In the browser address bar (top right), click the **App Install Icon** (looks like a computer screen with an arrow, or click the 3 dots ➔ *Apps* ➔ *Install this site as an app*).
4. Click **Install**.
5. The app will open in its own clean, dedicated desktop window. A shortcut is also placed on your Windows Desktop.

---

## 🛡️ 2. User Roles & Security

| View Mode | Who It Is For | Access Requirements | What They Can Do |
| :--- | :--- | :--- | :--- |
| **Admin & Staff Dashboard** | NGO Field Workers, Supervisors, Admins | Staff PIN: **`2026`** | Add new trees, update existing records, print QR code labels, export Excel spreadsheets, view cloud sync status. |
| **Public QR Verification Page** | Donors, Villagers, Auditors, General Public | Scan any physical tree QR code *(No login required)* | View verified tree details, health certificate, Google Maps GPS directions. **All edit and admin buttons are hidden.** |

---

## 🌳 3. Core Features & Step-by-Step Guide

### A. Dashboard & Registry Overview
- **Statistics Counters**: At the top of the dashboard, you will see real-time statistics:
  - **Total Trees**: Total count of all registered trees in the sanctuary.
  - **Healthy 🟢**: Trees in good condition.
  - **Needs Care 🟡**: Trees flagged for watering, pruning, or insect protection.
  - **Stunted / Dead 🔴**: Trees needing replanting or replacement.
  > 💡 *Tip: Tap any statistics card to instantly filter the tree list by that health status!*
- **Search Bar**: Quickly locate any tree by typing:
  - Tree ID (e.g., `JGF-2026-1001`)
  - Species name (e.g., `Neem`, `Banyan`, `Peepal`)
  - Village / Habitat (e.g., `Dharamsala`, `Rait`)
  - Donor name (e.g., `Sunita Sharma`)
  - Exact plantation date (e.g., `2026-03-15`)
- **Date Grouping**: Trees are organized by Plantation Date in collapsible accordions. Tap any date to expand and view the trees planted on that day.

---

### B. Adding a New Tree Record
When field staff plants a new tree:
1. Tap the green **"Add Tree"** button on the dashboard.
2. The form will automatically generate:
   - A unique **Tree ID** (e.g., `JGF-2026-1018`).
   - The current **Plantation Date**.
3. **Capture Live GPS**:
   - Tap **"Get Current GPS"**. The device will fetch high-precision Latitude & Longitude coordinates.
4. **Fill In Field Details**:
   - **Species Name**: Select or type the tree species (e.g., *Neem, Mango, Gulmohar*).
   - **Village / Site**: Location of plantation.
   - **Donor Name**: Person or organization sponsoring the tree.
   - **Height & Girth**: Initial measurements (e.g., `4.5 ft`, `12 cm`).
   - **Health Status**: Select *Healthy*, *Needs Care*, or *Stunted*.
   - **Photo**: Tap **"Take Photo"** or **"Upload Photo"** to capture the sapling in the ground.
5. Tap **"Save Tree Record"**.
   - The tree is saved to the local database and instantly synced to the Supabase cloud.
   - A unique QR code is immediately generated.

---

### C. Updating / Auditing an Existing Tree
When staff conducts regular inspections (e.g., every 3–6 months):
1. Tap the orange **"Update Tree"** button on the dashboard.
2. Enter the Staff PIN: **`2026`**.
3. Search or select the tree you are inspecting from the list.
4. Update any field that has changed:
   - **Current Height & Girth**: Track growth progress.
   - **Survival Status**: Update to *Healthy*, *Needs Care*, or *Stunted*.
   - **Last Inspection Date**: Updates to today's date automatically.
   - **Inspection Photo**: Take a fresh photo showing growth.
   - **Coordinates**: Can be refreshed if needed.
5. Tap **"Save & Update"**.
   - The changes are saved to the cloud.
   - **Live Sync:** Any donor or public visitor viewing that tree's QR page will see the updates appear on their screen live without reloading!

---

### D. Printing QR Code Tags for Physical Trees
Jagori Tree Tracker includes built-in print templates formatted for physical tagging:
- **Single Tree Tag**:
  - In the dashboard tree list, tap any tree to view its details.
  - Tap **"Print QR Card"**.
  - A clean label card opens with the Tree ID, Species, Donor, and QR code, ready to send to a thermal tag printer or regular printer.
- **Batch A4 Printing (Multi-QR Sheets)**:
  - Tap **"🖨️ Batch A4 QRs"** on the dashboard header.
  - Select which trees to print (e.g., all trees planted today or a specific batch).
  - Tap **"Print A4 Sheet"**.
  - Generates an A4 grid of durable labels ready for laminating and tying to tree guards in the field.

---

### E. Public QR Code Verification (Donor Experience)
When a donor, tourist, or community member scans a physical QR tag on a tree:
1. Their phone camera opens the link directly (e.g., `https://jagori-tree-app.vercel.app/?treeId=JGF-2026-1001&view=public`).
2. They see an official **Verified Certificate**:
   - Species, Plantation Date, and Tree ID.
   - Dedicated Donor acknowledgment (*"Sponsored with love by..."*).
   - Growth metrics (Height, Girth, Last inspected date).
   - Verified photo of the tree.
   - **Interactive GPS Navigation**: Tapping **"Open in Google Maps"** launches turn-by-turn walking or driving directions directly to the exact tree!
3. **Strict Security**: The public screen has no admin controls, no delete options, and no edit capabilities.

---

### F. Exporting the Registry to Excel (`.xlsx`)
To share records with donors, government authorities, or conservation partners:
1. Tap the green **"📊 Export Excel"** button on the dashboard.
2. An official Excel spreadsheet (`.xlsx`) is instantly downloaded to your device containing all columns:
   - Tree ID, Species, Plantation Date, GPS Latitude, Longitude, Google Maps Link, Donor Name, Village, Height, Girth, Survival Status, and Last Inspection Timestamp.

---

### G. Offline Resilience & Cloud Sync
- **No Internet in the Forest?** The app is built with local caching (`AsyncStorage`). If field staff is in an area with zero cellular reception, they can still add and view trees.
- **Automatic Cloud Sync:** The moment the device reconnects to mobile data or Wi-Fi, all pending records automatically sync to the secure Supabase database with zero data loss.

---

## ❓ Frequently Asked Questions (FAQ)

**Q1: What is the Staff Admin PIN?**  
> The default staff passcode is **`2026`**. It is required whenever editing or updating tree records.

**Q2: Does the public view depend on my laptop or local Wi-Fi?**  
> **No.** The app is permanently hosted on Vercel's global HTTPS cloud (`https://jagori-tree-app.vercel.app`). Anyone in the world on 4G, 5G, or Wi-Fi can scan and view tree information anytime.

**Q3: Can someone viewing a QR code tamper with the data?**  
> **No.** The public QR page operates in read-only mode. All navigation bars, edit forms, and PIN prompts are stripped from the public view.

**Q4: How do I share the app with new NGO staff members?**  
> Simply send them the link: **`https://jagori-tree-app.vercel.app`**. Instruct them to open it in Chrome (Android) or Safari (iPhone) and tap **"Install App"** / **"Add to Home Screen"**.
