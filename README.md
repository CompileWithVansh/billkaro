# BillKaro — Touch POS & Kitchen Display

[![PWA Ready](https://img.shields.io/badge/PWA-Installable-blue.svg)](https://web.dev/progressive-web-apps/)
[![Web Bluetooth](https://img.shields.io/badge/Web%20Bluetooth-ESC%2FPOS-orange.svg)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API)
[![Offline-First](https://img.shields.io/badge/Offline--First-IndexedDB%20%2B%20SW-success.svg)](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
[![Realtime KDS](https://img.shields.io/badge/KDS-WebSockets-critical.svg)](https://socket.io/)
[![Gemini AI](https://img.shields.io/badge/AI%20Scanner-Google%20Gemini-8e44ad.svg)](https://ai.google.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**BillKaro** is a touch-first Point-of-Sale (POS) and Kitchen Display System (KDS) engineered for restaurants, cafes, food trucks, cloud kitchens, and quick-service counters (QSRs).

Built as an **installable Progressive Web App (PWA)**, BillKaro runs seamlessly across **smartphones, tablets, commercial POS terminals, and desktop computers** — featuring **offline billing resilience**, direct browser **Bluetooth thermal printing**, dynamic **zero-fee UPI QR payments**, and real-time **kitchen order synchronization**.

---

## 🚀 Key Highlights & Capabilities

- 📱 **Universal Cross-Platform PWA**: Runs on Android, iOS, Windows, macOS, and Linux. Install directly from the browser to the home screen or desktop for a fullscreen, app-like experience.
- ⚡ **Offline-First & Fast Local Caching**: Powered by **Service Workers** and **IndexedDB**. Continue billing and printing receipts during network drops or in low-connectivity environments; automatically syncs back to the cloud upon reconnection.
- 🖨️ **Direct Web Bluetooth Thermal Printing**: Streams raw ESC/POS commands directly to 58mm and 80mm Bluetooth thermal printers from the browser without bridge software or drivers.
- 🍳 **Live Kitchen Display System (KDS)**: Real-time order dispatch via WebSockets with audio chime alerts, visual status badges, incremental order tracking, and 6-digit PIN / QR code kitchen screen pairing.
- 💳 **Smart Payments & Zero-Fee UPI**: Generates dynamic on-device NPCI UPI QR codes containing the store's VPA and exact payable amount (PhonePe, GPay, Paytm, BHIM). Supports **Cash**, **Split Payments (Cash + UPI)**, and **Customer Khata (Udhaar / Credit)**.
- 📋 **Customer Khata (Udhaar) & WhatsApp CRM**: Track customer credit balances with phone numbers. Send digital bills or 1-click WhatsApp payment reminders with store pay links.
- 🤖 **AI-Powered Menu Digitizer (Gemini Vision)**: Snap a photo of a physical menu or paper bill; Google Gemini AI extracts items, categories, portion sizes, prices, and descriptions straight into your catalog.
- 📦 **Stock & Inventory Control**: Real-time stock counters, low-stock warnings, out-of-stock badges, and quick-adjustment steppers.
- 📊 **Business Analytics & GST Engine**: Daily, weekly, monthly, and custom range sales reporting; revenue summaries; payment method mix; top-selling dishes; and dual-mode GST calculation (MRP inclusive or exclusive).

---

## 🎯 Feature Breakdown

### 1. 📱 Universal PWA & Device Support
- **Adaptive Layout**: Responsive UI tailored for mobile phones (docked thumb-zone action bar), tablets (65/35 split catalog and active cart workspace), and desktop monitors.
- **Standalone PWA**: Installable via Chrome, Edge, or Safari (`Add to Home Screen`). Fullscreen mode with app icon, splash screen, and offline shell caching.
- **Orientation Ergonomics**: Automatic adaptation for portrait (docked floating total drawer) and landscape (side-by-side catalog and multi-cart view).

### 2. ⚡ Offline-First Architecture & Local Caching
- **IndexedDB Catalog & Outbox**: Store items, prices, and categories locally in `billkaro_offline_db`.
- **Zero-Latency Billing**: Cashiers can build carts, generate bills, and trigger Bluetooth printing even when completely disconnected from the internet.
- **Idempotent Background Sync**: Unsynced bills are queued in `pending_bills` with unique client UUIDs. When internet returns, the background sync worker flushes pending bills to the server with zero duplicate entries.
- **Service Worker (`sw.js`)**: Cache-first asset caching for instant app load speeds (< 300ms) with network-first navigation fallbacks.

### 3. 🖨️ Direct Web Bluetooth ESC/POS Printing
- **Browser-to-Hardware BLE**: Connects directly to BLE GATT characteristics for 58mm & 80mm receipt printers (SC588, MPT-II, POS-58, Everycom, Android POS, etc.).
- **High-Definition 1-Bit Raster Typography**: Custom monochrome bitmap rendering engine for store headers and logos, eliminating blurry printer ROM fonts and horizontal scanline artifacts.
- **Flow-Controlled MTU Chunking**: Dispatches 60-byte MTU packets with calibrated 8ms pauses to prevent Bluetooth buffer overruns and dropped receipts.
- **Paper-Saving Logic**: Automatically suppresses QR codes on Cash and Udhaar transactions to conserve 2.5–3 cm of thermal paper per receipt.
- **Fallback Browser Printing**: Standard OS print dialog and PDF preview for USB, Wi-Fi, or network printers.

### 4. 🍳 Real-Time Kitchen Display System (KDS)
- **Instant KOT Dispatch**: Sub-15ms ticket delivery over persistent WebSockets (`socket.io`).
- **Audio Chimes**: Two-tone chime alert rings whenever a new order is received by the kitchen.
- **Color-Coded Aging States**:
  - 🟡 **Yellow / Amber**: New order (< 5 minutes)
  - 🔵 **Blue**: In preparation / cooking (5–15 minutes)
  - 🔴 **Red**: Delayed order (> 15 minutes)
  - 🟢 **Green**: Order ready for pickup / dispatch
- **Interactive Checklists**: Kitchen staff tap individual line items to strike them out as they are prepared.
- **Incremental Order Sync**: Adding dishes to an existing open table automatically updates the active kitchen ticket, highlighting newly added items.
- **Fast Kitchen Pairing**: Pair kitchen Android TVs, tablets, or phones instantly using a 6-digit PIN or QR code without sharing master cashier credentials.

### 5. 🗂️ Multi-Bill Tabs & Table Management
- **Chrome-Style Billing Tabs**: Seamlessly switch between active tables (`T1`, `T2`, `Takeaway 1`, `VIP-1`).
- **Persistent State**: Open tabs, items, and quantities are saved per cashier session and survive accidental page refreshes.
- **Quick Tab Renaming**: Double-tap any tab label to assign table numbers, waiter initials, or customer names.
- **Sub-3-Second Checkout Flow**: Tap items → tap Pay → tap Paid & Close. Zero mandatory modal hops.

### 6. 💳 Flexible Payments, UPI & Customer Khata (Udhaar)
- **Dynamic On-Device UPI QR**: Generates dynamic NPCI-compliant UPI QR codes locally from the store's VPA. Customers scan with PhonePe, Google Pay, Paytm, or BHIM. No payment gateway merchant commissions.
- **Split Payments**: Collect partial cash and partial UPI; generates a QR code dynamically encoded for only the remaining UPI balance.
- **Two-Phase Settlement ("Print Never Means Paid")**: Print pre-payment checks for diners while keeping the active table open on the counter until final payment is handed over.
- **Customer Khata (Udhaar / Credit Ledger)**: Record unpaid tabs to regular customer accounts with contact numbers.
- **1-Click WhatsApp Reminders & Receipts**:
  - Share rendered digital bill images via WhatsApp (`html-to-image`).
  - Send 1-click WhatsApp payment reminders with store UPI links for outstanding Udhaar accounts.

### 7. 🤖 AI Vision Menu Scanner (Google Gemini)
- **Instant Digitization**: Take a photo of a physical menu card, handwritten chalkboard, or printed brochure.
- **Multimodal Extraction**: Google Gemini AI parses dish names, categories, prices, portion variants (Quarter / Half / Full), and descriptions directly into your menu catalog.
- **Category Auto-Grouping**: Scanned items automatically create categorized filter buttons on the billing board.

### 8. 🎨 Customization, Variants & Drag-and-Drop
- **Portion & Size Variants**: Create multi-tier portions (e.g. Regular / Large, Half / Full, 250ml / 500ml) with independent pricing.
- **Tactile Color Coding**: Assign distinct button colors from curated palettes for instant visual recognition.
- **Drag-and-Drop Reordering**: Rearrange catalog items and categories effortlessly via `@dnd-kit`.
- **Category Arrangement**: Organize and prioritize menu categories to match physical kitchen workflow.

### 9. 📦 Inventory & Stock Management
- **Live Stock Tracking**: Real-time stock counts displayed on item tiles.
- **Visual Stock Alerts**: Low-stock warnings and out-of-stock overlay badges that prevent cashiers from billing depleted items.
- **Quick-Adjust Matrix**: Fast stock updates (+1, -1, +5, -5, Out of Stock, Unlimited) with batch saving.

### 10. 📊 Analytics, Reports & GST Engine
- **Flexible Sales Periods**: View performance Today, Yesterday, Last 7 Days, This Month, or across Custom Date Ranges.
- **Financial Breakdown**: Gross revenue, discounts given, net revenue, and collected tax.
- **Payment Method Distribution**: Clear split of Cash vs. UPI vs. Split vs. Udhaar revenue.
- **Dish-Wise Popularity**: Identifies top-performing menu items and volume sold.
- **Dual-Mode GST / Tax Calculation**: Support for both Tax-Inclusive pricing (MRP) and Tax-Exclusive pricing (e.g. 5%, 12%, 18%).
- **Discounts**: Apply flat amount (₹) or percentage (%) discounts with live total recalculation.
- **Accounting Export**: Export bill histories to CSV for GST filings and accounting.

---

## 🏗️ System Architecture

```
                                  CLIENT (BROWSER / PWA)
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                                                                         │
│  ┌────────────────────────┐      (Web Bluetooth)      ┌──────────────────────────────┐  │
│  │    POS Billing Page    │ ────────────────────────> │  58mm / 80mm Thermal Printer │  │
│  │ - Multi-tab Cart Engine│    60B Chunks / 8ms pause │  - ESC/POS Raster Typography │  │
│  │ - Dynamic UPI QR Engine│                           │  - Paper-Saving QR Filter    │  │
│  └────────────────────────┘                           └──────────────────────────────┘  │
│         │               │                                                               │
│   (Local Cache)   (Sync Outbox)                                                         │
│         │               │                                                               │
│         ▼               ▼                             ┌──────────────────────────────┐  │
│  ┌─────────────┐ ┌─────────────┐                      │     KDS Kitchen Page (/kds)  │  │
│  │ServiceWorker│ │  IndexedDB  │                      │ - Real-time WebSocket Feed   │  │
│  │ (PWA Shell) │ │(Offline DB) │                      │ - Audio Chimes & Age Timers  │  │
│  └─────────────┘ └─────────────┘                      └──────────────────────────────┘  │
│         │               │                                            ▲                  │
└─────────┼───────────────┼────────────────────────────────────────────┼──────────────────┘
          │               │ (HTTP / REST)                              │ (WebSockets)
          ▼               ▼                                            │
┌──────────────────────────────────────────────────────────────────────┼──────────────────┐
│                          BACKEND SERVICE (Node.js / Express)         │                  │
│                                                                      │                  │
│  ┌─────────────────────────┐   ┌──────────────────────────┐   ┌──────────────────────┐  │
│  │    Auth & Security      │──>│   Bill & Item Routes     │──>│  Socket.io Server    │  │
│  │ (JWT, Bcrypt, RateLimit)│   │ (Sync & Idempotency Key) │   │ (KDS Broadcaster)    │  │
│  └─────────────────────────┘   └──────────────────────────┘   └──────────────────────┘  │
│                                              │                                          │
│                                              ▼                                          │
│                                ┌──────────────────────────┐                             │
│                                │   PostgreSQL Database    │                             │
│                                │ (Cloud Neon / Supabase)  │                             │
│                                └──────────────────────────┘                             │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 🛠️ Technology Stack

| Layer | Technology | Key Capabilities |
| :--- | :--- | :--- |
| **Frontend Framework** | React 18, TypeScript, Vite | Lightning-fast rendering, type safety, HMR |
| **PWA & Offline** | Service Workers, Web Manifest, IndexedDB | Offline resilience, local catalog caching, background sync |
| **Hardware** | Web Bluetooth API (BLE), ESC/POS | Native direct thermal receipt printing from browser |
| **Realtime Engine** | Socket.io Client & Server | Sub-15ms live order sync for kitchen screens |
| **Touch & Gestures** | `@dnd-kit` (Core & Sortable) | Smooth drag-and-drop item & category arrangement |
| **AI Vision** | Google Gemini API (`@google/genai`) | Multimodal menu photo-to-catalog extraction |
| **Backend & API** | Node.js, Express, Helmet, CORS | RESTful API, CSP security, compression, rate limiting |
| **Database** | PostgreSQL (`pg`) | Reliable cloud datastore (Neon, Supabase, AWS RDS) |
| **Media & Sharing** | `html-to-image`, `qrcode` | WhatsApp digital bill images & dynamic UPI QR codes |

---

## 💻 Getting Started (Local Development)

### Prerequisites
- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher
- **PostgreSQL**: Local instance or free cloud database (e.g. [Neon](https://neon.tech) / [Supabase](https://supabase.com))

### 1. Clone & Setup Workspace
```bash
git clone https://github.com/your-username/billkaro.git
cd billkaro
```

### 2. Configure Backend
```bash
cd backend
npm install
cp .env.example .env
```

Edit `backend/.env` with your credentials:
```ini
NODE_ENV=development
PORT=4000
JWT_SECRET=super_secret_dev_key_at_least_16_chars_long
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require
# Optional: Enable AI Menu Scanner
GEMINI_API_KEY=your_gemini_api_key_here
```

Start backend development server:
```bash
npm run dev
# Running on http://localhost:4000
```

### 3. Configure Frontend
Open a second terminal window:
```bash
cd frontend
npm install
npm run dev
# Running on http://localhost:5173
```

> **Testing on Mobile/Tablet over Local Wi-Fi**:
> Vite runs with `--host` enabled. Check the terminal for your Network URL (e.g., `http://192.168.1.50:5173`).
> To test on mobile devices, point `VITE_API_URL` to your machine's IP (e.g., `http://192.168.1.50:4000/api`) and allow the port on your local firewall.

---

## 🚀 Production Deployment

### Option A: Single-Process Node Server (Recommended)
In production, the backend serves the compiled Vite SPA directly. The entire application runs as **a single process on one URL**, eliminating CORS friction.

```bash
# 1. From root directory, build frontend
npm --prefix frontend install
npm --prefix frontend run build      # Produces frontend/dist

# 2. Install production backend dependencies
npm --prefix backend install --omit=dev

# 3. Launch server with environment variables
NODE_ENV=production \
PORT=4000 \
JWT_SECRET=your_strong_random_jwt_secret_min_16_chars \
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require \
node backend/src/server.js
```

### Option B: Docker Container
A multi-stage `Dockerfile` is included:
```bash
# Build Docker image
docker build -t billkaro:latest .

# Run Docker container
docker run -d -p 4000:4000 \
  -e NODE_ENV=production \
  -e JWT_SECRET="your-strong-random-jwt-secret-here" \
  -e DATABASE_URL="postgresql://user:password@host/dbname?sslmode=require" \
  -e GEMINI_API_KEY="your-gemini-key-if-using-ai-scanner" \
  --name billkaro-app \
  billkaro:latest
```

### Option C: One-Click Render Deployment
This repository contains a pre-configured `render.yaml` Blueprint:
1. Push this repository to GitHub or GitLab.
2. Go to [Render Dashboard](https://dashboard.render.com/) -> **New** -> **Blueprint**.
3. Connect your repository. Render will automatically:
   - Build frontend assets and production backend dependencies.
   - Auto-generate a secure `JWT_SECRET`.
   - Configure health check monitoring at `/api/health`.
4. Add your cloud Postgres connection string to `DATABASE_URL` in the service settings.

---

## ⚙️ Environment Variables Reference

### Backend (`backend/.env`)

| Variable | Required | Default | Description |
| :--- | :---: | :---: | :--- |
| `NODE_ENV` | **Yes** | `development` | Set to `production` for production mode (enforces security checks & serves SPA). |
| `PORT` | No | `4000` | Port for Express & WebSocket server. |
| `JWT_SECRET` | **Yes** | — | Secret string for signing auth tokens (must be >= 16 characters in production). |
| `JWT_EXPIRES_IN` | No | `7d` | Authentication token validity duration (e.g. `7d`, `24h`). |
| `DATABASE_URL` | **Yes** | — | PostgreSQL connection string (`postgresql://user:pass@host/db?sslmode=require`). |
| `CORS_ORIGIN` | No | `*` (dev) | Comma-separated allowed frontend origins if hosted on a separate domain. |
| `GEMINI_API_KEY` | No | — | Google Gemini API key to enable AI Menu Card scanning. |

### Frontend (`frontend/.env`) — All Optional

| Variable | Default | Description |
| :--- | :---: | :--- |
| `VITE_API_URL` | `/api` | Base URL for the backend API. Leave unset for same-origin single-process hosting. |

---

## 🔒 Security & Reliability Architecture

- **Client-Side Idempotency**: Offline bills are assigned UUID v4 identifiers, preventing double-billing on network retries.
- **Hardened Content Security Policy (CSP)**: Tailored CSP headers permit dynamic data URIs (QR codes), WebSockets (`ws:` / `wss:`), and canvas blobs while blocking unvetted scripts.
- **Strict Input Sanitization**: Comprehensive sanitization for table labels, dish names, portion descriptors, and phone numbers to eliminate Stored XSS.
- **Rate-Limiting Protection**: Dedicated rate limits for login attempts (`10/15min`), general API queries (`250/min`), and vision AI scanning (`15/10min`).
- **GATT Disconnect Recovery**: Automatic Web Bluetooth reconnection logic with device caching in `localStorage`.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
