const express = require("express");
const cors = require("cors");
const dns = require("dns");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const { createRemoteJWKSet, jwtVerify } = require("jose-cjs");

// DNS Fix for specific ISPs blocking MongoDB Atlas
// (Vercel-এ কখনো কখনো সমস্যা তৈরি করতে পারে, প্রয়োজনে কমেন্ট করে টেস্ট করবেন)
try {
  dns.setServers(["8.8.8.8", "8.8.4.4"]);
} catch (error) {
  console.error("⚠️ DNS configuration warning:", error.message);
}

const app = express();
const port = process.env.PORT || 5000;

// ------------------ CORS ------------------
const allowedOrigins = [
  'http://localhost:3000',
  "https://tutor-booking-system-psi.vercel.app"
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  })
);
// JWT
const verifyToken = async (req, res, next) => {
  const { authorization } = req.headers;
    console.log(req.headers, 'from verify token');
  const token = authorization?.split(' ')[1];
    console.log(token);

  if (!token) {
    return res.status(401).json({ message: 'Unauthorize' });
  }

  try {
    const JWKS = createRemoteJWKSet(new URL('http://localhost:3000/api/auth/jwks'));
    const { payload } = await jwtVerifyVerify(token, JWKS);
    req.user = payload;
    console.log('Token verified successfully:', payload);

    next();
  } catch (error) {
    console.error('Token validation failed:', error);
    return res.status(401).json({ message: 'Unauthorize' });
  }
};
// ------------------ Body Parsers ------------------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ------------------ MongoDB Setup ------------------
const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
if (!uri) {
  console.error("❌ FATAL ERROR: MongoDB connection URI is missing from .env file.");
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

// ------------------ Robust Connection Middleware (Serverless-safe) ------------------
let clientPromise;

async function connectToDatabase() {
  if (!clientPromise) {
    clientPromise = client
      .connect()
      .then(() => {
        console.log("✅ Connected perfectly to MongoDB");
        return client;
      })
      .catch((err) => {
        console.error("❌ MongoDB Connection Error:", err);
        clientPromise = null; // reset on failure so next attempt retries
        throw err;
      });
  }
  await clientPromise;
}

// Attach DB connection check to every request
app.use(async (req, res, next) => {
  try {
    await connectToDatabase();
    next();
  } catch (err) {
    res.status(500).json({ error: "Database connection failed", details: err.message });
  }
});

// ------------------ Health Check ------------------
app.get("/", (req, res) => {
  res.send("🚀 Tutors Finder Server Running Perfectly!");
});

// ========================
//     TUTORS ROUTES
// ========================

app.get("/api/tutors", verifyToken, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 0;
    const result = await tutorsCollection.find({}).limit(limit).toArray();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch tutors", details: error.message });
  }
});

app.get("/api/tutors/:id",verifyToken, async (req, res) => {
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

app.post("/api/tutors", verifyToken, async (req, res) => {
  try {
    // Basic validation
    if (!req.body || Object.keys(req.body).length === 0) {
      return res.status(400).json({ error: "Request body is empty" });
    }
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

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: "No update fields provided" });
    }

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
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }
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
//   BOOKINGS ROUTES
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
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }
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

// ------------------ Global Error Handler ------------------
app.use((err, req, res, next) => {
  console.error("Unhandled Error:", err.stack);
  res.status(500).json({ error: "Internal Server Error", details: err.message });
});

// ------------------ Export for Vercel ------------------
module.exports = app;

// ------------------ Local Server ------------------
if (process.env.NODE_ENV !== "production") {
  app.listen(port, () => console.log(`🚀 Server running locally on port ${port}`));
}