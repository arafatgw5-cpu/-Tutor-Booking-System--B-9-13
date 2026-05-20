const express = require("express");
const cors = require("cors");
const dns = require("dns");
require("dotenv").config();

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const { betterAuth } = require("better-auth");
const { mongodbAdapter } = require("better-auth/adapters/mongodb");
const { toNodeHandler } = require("better-auth/node");

// DNS Fix for some ISPs
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const app = express();
const port = process.env.PORT || 5000;

// CORS Setup
app.use(
  cors({
    origin: ["http://localhost:3000", process.env.CLIENT_URL], 
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Database variables
const uri = process.env.MONGO_URI;
if (!uri) {
  console.error("❌ FATAL ERROR: MONGO_URI is missing.");
  process.exit(1);
}

// Global MongoDB Client
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const database = client.db("tutorsFinderDB");
const tutorsCollection = database.collection("tutors");
const bookingsCollection = database.collection("bookings");

// 🚀 Better Auth Setup (With Secret for Production)
const auth = betterAuth({
  database: mongodbAdapter(database, { client }),
  secret: process.env.BETTER_AUTH_SECRET || "fallback_secret_for_local_123", // Vercel-এ এটা মাস্ট লাগবে
  emailAndPassword: { 
    enabled: true 
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || "MISSING_CLIENT_ID",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "MISSING_CLIENT_SECRET",
    },
  },
  trustedOrigins: ["http://localhost:3000", process.env.CLIENT_URL], 
  baseURL: process.env.BETTER_AUTH_URL || `http://localhost:${port}`, 
});

// Connect DB (Non-blocking for Vercel)
client.connect()
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch(err => console.error("❌ MongoDB Connection Error:", err));

// 🛑 THE ULTIMATE FIX FOR EXPRESS 5 & VERCEL ROUTING:
app.all(/^\/api\/auth/, toNodeHandler(auth));

// Base Route
app.get("/", (req, res) => res.send("🚀 Tutors Finder Server Running Perfectly on Vercel!"));

// --- TUTORS ROUTES ---
app.get("/api/tutors", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 4;
    const result = await tutorsCollection.find({}).limit(limit).toArray();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/tutors/:id", async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "Invalid ID" });
    const result = await tutorsCollection.findOne({ _id: new ObjectId(req.params.id) });
    if (!result) return res.status(404).json({ error: "Not found" });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/tutors", async (req, res) => {
  try {
    const result = await tutorsCollection.insertOne(req.body);
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/tutors/:id", async (req, res) => {
  try {
    const result = await tutorsCollection.updateOne(
      { _id: new ObjectId(req.params.id) }, 
      { $set: { ...req.body } }
    );
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/tutors/:id", async (req, res) => {
  try {
    const result = await tutorsCollection.deleteOne({ _id: new ObjectId(req.params.id) });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 🚀 GET MY TUTORS (By Email)
app.get("/api/my-tutors/:email", async (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email).trim().toLowerCase();
    const query = { email: { $regex: `^${email}$`, $options: "i" } };
    const result = await tutorsCollection.find(query).sort({ _id: -1 }).toArray();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- BOOKINGS ROUTES ---
app.post("/api/bookings", async (req, res) => {
  try {
    const booking = req.body;
    if (!booking.email || !booking.tutorId) {
      return res.status(400).json({ error: "Email and tutorId are required" });
    }
    const bookingData = {
      ...booking,
      bookedAt: new Date().toISOString(),
      status: "pending", 
    };
    const result = await bookingsCollection.insertOne(bookingData);
    res.status(201).json({ message: "Success", bookingId: result.insertedId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/booked-sessions/:email", async (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email).trim().toLowerCase();
    const query = { email: { $regex: `^${email}$`, $options: "i" } };
    const result = await bookingsCollection.find(query).sort({ bookedAt: -1 }).toArray();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/bookings/:id", async (req, res) => {
  try {
    const result = await bookingsCollection.findOne({ _id: new ObjectId(req.params.id) });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/bookings/:id", async (req, res) => {
  try {
    const result = await bookingsCollection.deleteOne({ _id: new ObjectId(req.params.id) });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Export for Vercel Serverless Functions
module.exports = app;

// Local Development
if (process.env.NODE_ENV !== "production") {
  app.listen(port, () => console.log(`🚀 Server running on port ${port}`));
}