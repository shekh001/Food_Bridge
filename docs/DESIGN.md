# FoodBridge — Design Document

## 1. Entity-Relationship Diagram

```mermaid
erDiagram
    USER ||--o{ FOOD_LISTING : "posts (as donor)"
    USER ||--o{ FOOD_LISTING : "claims (as NGO)"
    USER ||--o{ MATCHED_CANDIDATE : "is ranked in"
    FOOD_LISTING ||--o{ MATCHED_CANDIDATE : "has candidates"

    USER {
        ObjectId _id PK
        string name
        string email UK
        string passwordHash
        enum role "donor | ngo | admin"
        string orgName
        enum orgType "restaurant | hotel | caterer | grocery_store | shelter | ngo | community_kitchen | other"
        string phone
        string address
        number location_lat
        number location_lng
        boolean verified
        string verificationDoc
        number dailyCapacityKg "ngo only"
        number rating
        number totalDonationsKg
        number totalReceivedKg
        date createdAt
        date updatedAt
    }

    FOOD_LISTING {
        ObjectId _id PK
        ObjectId donor FK "-> USER._id"
        string foodType
        string description
        number quantityKg
        number servingsEstimate "derived: quantityKg * 2.5"
        date expiryAt
        string pickupLocation_address
        number pickupLocation_lat
        number pickupLocation_lng
        enum status "posted|claimed|picked_up|delivered|expired|cancelled"
        ObjectId claimedBy FK "-> USER._id, nullable"
        date claimedAt
        date pickedUpAt
        date deliveredAt
        string notes
        date createdAt
        date updatedAt
    }

    MATCHED_CANDIDATE {
        ObjectId ngo FK "-> USER._id"
        number distanceKm
        number urgencyScore
        number totalScore
    }
```

`MATCHED_CANDIDATE` is an embedded sub-document array inside `FOOD_LISTING`
(`matchedCandidates: [...]`) rather than a separate collection — it's a
denormalized snapshot of the matching engine's ranked output at post-time,
kept for transparency/audit ("why was this NGO notified?"), not a live
relation. It's modeled above as a distinct entity to make that ranking
relationship explicit.

**Design decisions:**
- MongoDB (document DB) was chosen over a strict relational schema because
  the two actor types (donor, NGO) share one `USER` collection distinguished
  by `role`, and `pickupLocation` / `location` are naturally nested objects.
  Both are still **normalized** for the relations that matter: `FOOD_LISTING`
  references `USER` by ObjectId (`donor`, `claimedBy`) rather than embedding
  donor/NGO data, avoiding duplication and stale copies.
- Compound indexes on `(status, expiryAt)` and `(lat, lng)` support the two
  hottest queries: "active listings sorted by urgency" and "listings near a
  point" (matching engine).

---

## 2. System Architecture

```mermaid
flowchart TB
    subgraph Client["Browser"]
        React["React SPA (Vite)\nRole-aware dashboards"]
        Leaflet["Leaflet map picker\n(OpenStreetMap tiles + Nominatim geocoding)"]
        SocketClient["Socket.io client"]
    end

    subgraph Server["Node.js / Express API"]
        Auth["Auth routes\n(JWT issue/verify)"]
        RBAC["requireRole() middleware"]
        Listings["Listing routes\n(post / browse / claim / status)"]
        MatchEngine["Matching Engine\n(haversine distance + urgency decay + quantity fit)"]
        Admin["Admin routes\n(NGO verification, disputes)"]
        Impact["Impact routes\n(meals saved, kg diverted, CO2e)"]
        Cert["Certificate controller\n(PDFKit CSR report)"]
        SocketServer["Socket.io server\n(per-user + per-role rooms)"]
    end

    DB[("MongoDB\nUsers + FoodListings")]

    React -->|"REST (axios, JWT bearer)"| Auth
    React --> Listings
    React --> Admin
    React --> Impact
    React --> Cert
    Leaflet -.->|"tile + geocode requests"| OSM["OpenStreetMap /\nNominatim (public)"]

    Auth --> RBAC
    Listings --> RBAC
    Admin --> RBAC

    Listings -->|"on new post"| MatchEngine
    MatchEngine -->|"ranked NGO candidates"| SocketServer
    Listings -->|"on status change"| SocketServer
    SocketServer -->|"real-time push"| SocketClient
    SocketClient --> React

    Auth --> DB
    Listings --> DB
    Admin --> DB
    Impact --> DB
    Cert --> DB
```

**Request flow — donor posts surplus food:**
1. Donor submits the listing form (React) → `POST /api/listings` (JWT-authed, `role: donor` only).
2. `listingController.create` saves the `FoodListing`, then calls the matching
   engine (`rankCandidates`) against all verified NGOs within
   `MAX_MATCH_RADIUS_KM`.
3. Ranked candidates are stored on the listing (`matchedCandidates`, for
   audit) and the top matches are emitted over Socket.io to
   `role:ngo` / targeted `user:<id>` rooms.
4. Matched NGOs' browsers receive the push instantly (no polling) and can
   claim the listing, which flips `status: posted → claimed` and notifies
   the donor the same way.
5. `picked_up → delivered` transitions are logged with timestamps, which
   feed directly into the impact calculator (meals saved, kg diverted).

---

## 3. Why these tech choices

| Layer | Choice | Reasoning |
|---|---|---|
| DB | MongoDB | Flexible schema for two actor types in one collection; fast to iterate on during a college project timeline |
| Real-time | Socket.io | Simpler than raw WebSockets for room-based targeting (per-user, per-role); auto-reconnect handled |
| Geolocation | Leaflet + OpenStreetMap + Nominatim | Free, no API key required — avoids Google Maps billing setup for a student/early-stage project |
| Auth | JWT + bcrypt | Stateless, easy to scale horizontally later; no session store needed |
| PDF | PDFKit | Generates the CSR donation certificate server-side, which is the platform's core monetization hook |
