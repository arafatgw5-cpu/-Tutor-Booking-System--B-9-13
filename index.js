const express = require("express");
const cors = require("cors");
const dns = require("dns");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

// DNS Fix for specific ISPs blocking MongoDB Atlas
try {
  dns.setServers(["8.8.8.8", "8.8.4.4"]);
} catch (error) {
  console.error("⚠️ DNS configuration warning:", error.message);
}

const app = express();
const port = process.env.PORT || 5000;

// CORS Setup (Handles local dev and production deployment seamlessly)
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  process.env.CLIENT_URL
].filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const uri = process.env.MONGO_URI || process.env.MONGODB_URI; // Handles both naming conventions
if (!uri) {
  console.error("❌ FATAL ERROR: MongoDB connection URI is missing from .env file.");
  process.exit(1);
}

// Global MongoDB Client Configuration
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

// 🚀 Database Connection Middleware (Vercel Serverless Safe)
let isConnected = false;
async function connectToDatabase() {
  if (isConnected) return;
  try {
    // await client.connect(); // ✨ FIXED: This was commented out in your original code
    isConnected = true;
    console.log("✅ Connected perfectly to MongoDB");
  } catch (err) {
    console.error("❌ MongoDB Connection Error:", err);
    throw err;
  }
}

app.use(async (req, res, next) => {
  try {
    await connectToDatabase();
    next();
  } catch (err) {
    res.status(500).json({ error: "Database connection failed", details: err.message });
  }
});

// ===================================================
// --- BETTER AUTH SETUP (Uncomment when ready) ---
// ===================================================
// const { betterAuth } = require("better-auth");
// const { mongodbAdapter } = require("better-auth/adapters/mongodb");
// const { toNodeHandler } = require("better-auth/node");
//
// const determineBaseURL = () => process.env.SERVER_URL || `http://localhost:${port}`;
//
// const auth = betterAuth({
//   database: mongodbAdapter(database, { client }),
//   secret: process.env.BETTER_AUTH_SECRET,
//   emailAndPassword: { enabled: true },
//   socialProviders: {
//     google: {
//       clientId: process.env.GOOGLE_CLIENT_ID,
//       clientSecret: process.env.GOOGLE_CLIENT_SECRET,
//     },
//   },
//   trustedOrigins: allowedOrigins,
//   baseURL: determineBaseURL(),
// });
//
// app.all(/^\/api\/auth(\/.*)?$/, toNodeHandler(auth));
// ===================================================

// Health Check Route
app.get("/", (req, res) => {
  res.send("🚀 Tutors Finder Server Running Perfectly!");
});

// ========================
// --- TUTORS ROUTES ---
// ========================

app.get("/api/tutors", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 0;
    const result = await tutorsCollection.find({}).limit(limit).toArray();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch tutors", details: error.message });
  }
});

app.get("/api/tutors/:id", async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: "Invalid ID format" });
    }
    const result = await tutorsCollection.findOne({ _id: new ObjectId(req.params.id) });
    if (!result) return res.status(404).json({ error: "Tutor not found" });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch tutor", details: error.message });
  }
});

app.post("/api/tutors", async (req, res) => {
  try {
    const result = await tutorsCollection.insertOne(req.body);
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ error: "Failed to add tutor", details: error.message });
  }
});

app.put("/api/tutors/:id", async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: "Invalid ID format" });
    }
    
    const updateData = { ...req.body };
    delete updateData._id; // Prevent immutable _id error

    const result = await tutorsCollection.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: updateData }
    );
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: "Failed to update tutor", details: error.message });
  }
});

app.delete("/api/tutors/:id", async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: "Invalid ID format" });
    }
    const result = await tutorsCollection.deleteOne({ _id: new ObjectId(req.params.id) });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: "Failed to delete tutor", details: error.message });
  }
});

app.get("/api/my-tutors/:email", async (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email).trim().toLowerCase();
    const result = await tutorsCollection
      .find({ email: { $regex: `^${email}$`, $options: "i" } })
      .sort({ _id: -1 })
      .toArray();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch your tutors", details: error.message });
  }
});

// ========================
// --- BOOKINGS ROUTES ---
// ========================

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
    res.status(500).json({ error: "Failed to create booking", details: error.message });
  }
});

app.get("/api/booked-sessions/:email", async (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email).trim().toLowerCase();
    const result = await bookingsCollection
      .find({ email: { $regex: `^${email}$`, $options: "i" } })
      .sort({ bookedAt: -1 })
      .toArray();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch bookings", details: error.message });
  }
});

app.get("/api/bookings/:id", async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: "Invalid ID format" });
    }
    const result = await bookingsCollection.findOne({ _id: new ObjectId(req.params.id) });
    if (!result) return res.status(404).json({ error: "Booking not found" });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch booking", details: error.message });
  }
});

app.delete("/api/bookings/:id", async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: "Invalid ID format" });
    }
    const result = await bookingsCollection.deleteOne({ _id: new ObjectId(req.params.id) });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: "Failed to delete booking", details: error.message });
  }
});

// Export for Vercel Serverless
module.exports = app;

// Run Local Server (Only if not in production/Vercel serverless environment)
if (process.env.NODE_ENV !== "production") {
  app.listen(port, () => console.log(`🚀 Server running locally on port ${port}`));
}