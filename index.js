const express = require("express");
const cors = require("cors");
require("dotenv").config();
const dns = require("dns");

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const { betterAuth } = require("better-auth");
const { mongodbAdapter } = require("better-auth/adapters/mongodb");
const { toNodeHandler } = require("better-auth/node");

// DNS Fix
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const app = express();
const port = process.env.PORT || 5000;

// CORS
app.use(
  cors({
    origin: "http://localhost:3000",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
  })
);
app.use(express.json());

const uri = process.env.MONGO_URI;
if (!uri) {
  console.log("❌ MONGO_URI not found in .env");
  process.exit(1);
}

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

const auth = betterAuth({
  database: mongodbAdapter(database, { client }),
  emailAndPassword: { enabled: true },
  trustedOrigins: ["http://localhost:3000"],
  baseURL: `http://localhost:${port}`, 
});

app.use("/api/auth", toNodeHandler(auth));

app.get("/", (req, res) => res.send("🚀 Tutors Finder Server Running"));

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
    const result = await tutorsCollection.updateOne({ _id: new ObjectId(req.params.id) }, { $set: { ...req.body } });
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






// 🚀 GET MY TUTORS (Specific User)
app.get("/api/my-tutors/:email", async (req, res) => {
  try {
    // Decode URI to safely handle @ and spaces
    const email = decodeURIComponent(req.params.email).trim().toLowerCase();
    
    // Find tutors where the email matches the logged-in user's email
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

// 🚀 GET SESSIONS (URL Email Fix)
app.get("/api/booked-sessions/:email", async (req, res) => {
  try {
    // Decode URI to safely handle @ and spaces
    const email = decodeURIComponent(req.params.email).trim().toLowerCase();
    
    // Case-insensitive exact match
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

// Connect DB
async function connectDB() {
  try {
    await client.connect();
    console.log("✅ Connected to MongoDB");
    app.listen(port, () => console.log(`🚀 Server running on port ${port}`));
  } catch (error) {
    console.error("❌ MongoDB Connection Failed", error);
    process.exit(1);
  }
}
connectDB();