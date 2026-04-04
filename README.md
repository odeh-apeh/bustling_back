
---

# Bustling Backend

A RESTful backend server for the **Bustling** platform, built with **Node.js**, **Express**, and **MySQL**. Supports authentication, wallet operations, product management, delivery, orders, chat, notifications, and session-based login.

**Database name:** `bustling`

---

## Table of Contents

* [Features](#features)
* [Tech Stack](#tech-stack)
* [Setup & Installation](#setup--installation)
* [Environment Variables](#environment-variables)
* [Available Routes](#available-routes)
* [Session & Authentication](#session--authentication)
* [Running the Server](#running-the-server)
* [License](#license)

---

## Features

* User authentication (register, login, logout)
* Session-based authentication with **MySQL store**
* Wallet management with payment verification
* Product catalog and uploads
* Delivery management and tracking
* Orders and notifications
* Chat system
* Cron jobs for automated tasks

---

## Tech Stack

* **Backend:** Node.js, Express
* **Database:** MySQL (database name: `bustling`)
* **Session Management:** express-session + express-mysql-session
* **CORS & Security:** cors, dotenv
* **File Storage:** Local `/uploads` folder
* **Payment Integration:** Paystack (webhooks support)

---

## Setup & Installation

1. **Clone the repository**

```bash
git clone https://github.com/yourusername/errandly-backend.git
cd errandly-backend
```

2. **Install dependencies**

```bash
npm install
```

3. **Set up MySQL database**

```sql
CREATE DATABASE bustling;
```

> Make sure your MySQL user has access to `bustling`.

4. **Configure environment variables**

Create a `.env` file in the root directory:

```env
PORT=3000
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=yourpassword
DB_NAME=bustling
SESSION_SECRET=your_session_secret
PAYSTACK_SECRET_KEY=your_paystack_key
```

---

## Available Routes

### Authentication

| Route                | Method | Description                     |
| -------------------- | ------ | ------------------------------- |
| `/api/auth/register` | POST   | Register a new user             |
| `/api/auth/login`    | POST   | Login a user                    |
| `/api/auth/logout`   | POST   | Logout the user (requires auth) |
| `/api/auth/me`       | GET    | Get current authenticated user  |

### Wallet

* `/api/wallet` – Deposit, withdraw, verify transactions

### Products

* `/api/products` – Add, view, update, and delete products

### Orders & Delivery

* `/api/delivery` – Delivery management
* `/api/orders` – Order management

### Notifications & Chat

* `/api/notifications` – Notifications
* `/api/chat` – Real-time chat

> All authenticated routes require session cookies.

---

## Session & Authentication

* Backend uses `express-session` stored in MySQL (`bustling` database).
* Session cookies must be sent with `credentials: 'include'` for cross-origin requests.
* Protected routes use `authMiddleware` to verify `req.session.userId`.

---

## Running the Server

```bash
npm run dev
```

Server will run on `http://localhost:3000`.

* Root route: `GET /` – Server status
* API root: `GET /api` – List of main endpoints

---

## License

This project is licensed under the **MIT License**.

---
