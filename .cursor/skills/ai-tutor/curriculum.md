# AI Tutor Curriculum

## Module 1: How the Web Works

**Goal:** Understand request/response, HTTP, and what happens when you visit a URL.

### CONTEXT
A website is like a restaurant: you (browser) place an order (request), the kitchen (server) prepares it, and a waiter brings it back (response). HTTP is the language they speak.

### DECIDE
**A)** Start by understanding HTTP requests/responses conceptually, then build a simple server.
**B)** Jump straight into building a server and learn HTTP by observing what it sends.

### BUILD
Create a minimal HTTP server that responds to `GET /` with "Hello, World!" and logs each request.

### VERIFY
- Server starts without errors
- `curl http://localhost:3000/` returns "Hello, World!"
- Server logs show the incoming request method and path

### BREAK
Change something so the server returns 404 for `/` but works for other paths. Student must diagnose.

### FIX
Student forms hypothesis, tests with curl, identifies the routing bug.

### REFLECT
**Decision Callback:**
- Chose A: You understood the contract first — the bug was easier to spot because you knew what a correct response looks like.
- Chose B: You learned by doing — the bug taught you that HTTP status codes are part of the contract, not optional decoration.

---

## Module 2: Data & Persistence

**Goal:** Understand why apps need databases and how to read/write data safely.

### CONTEXT
Memory is like a whiteboard — fast but erased on restart. A database is a filing cabinet — slower to open, but data survives.

### DECIDE
**A)** Use SQLite (file-based, zero setup) for learning.
**B)** Use an in-memory store first, then migrate to SQLite.

### BUILD
Add a `links` table and implement `POST /links` (create) and `GET /links/:code` (lookup).

### VERIFY
- POST creates a link and returns a short code
- GET with that code returns the original URL
- Data persists after server restart

### BREAK
Inject a bug where duplicate codes overwrite silently or reads return stale data.

### FIX
Student traces the data flow from route → query → response.

### REFLECT
Connect DECIDE choice to whether they anticipated persistence edge cases.

---

## Module 3: System Design Foundations

**Goal:** Decompose a feature into layers, define interfaces, and handle failure.

### CONTEXT
Production systems fail. Good design isolates failure so one broken piece doesn't collapse everything.

### DECIDE
**A)** Monolith: all logic in one process, simpler to start.
**B)** Separate service layers: routes, business logic, data access.

### BUILD
Refactor (or build) a URL shortener with clear separation: handler → service → repository.

### VERIFY
- Each layer has a single responsibility
- A test or manual check proves the service works without HTTP
- Error in DB layer returns 500, not a crash

### BREAK
Simulate DB connection failure; student must show graceful degradation.

### FIX
Add error handling at the right layer without leaking internals to the client.

### REFLECT
The DECIDE choice directly shaped how painful (or easy) the BREAK step was.

---

## Scoring Dimensions

| Dimension | What to observe |
|-----------|-----------------|
| tradeoff_reasoning | Quality of DECIDE justification |
| task_clarity | BUILD plan before coding |
| root_cause_depth | FIX hypothesis quality |
| production_thinking | Real-world framing in answers |
| communication_clarity | Can explain their work back |

Score 1–5 per dimension. Overall = honest average, not inflated.
