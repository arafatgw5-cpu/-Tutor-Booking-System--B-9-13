const express = require("express");
const cors = require("cors");
require("dotenv").config();
const dns = require("dns");

// DNS fix for MongoDB Atlas
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
// Middleware
app.use(cors());
app.use(express.json());

// Test Route
app.get("/", (req, res) => {
  res.send("Server is running successfully 🚀");
});
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
// Start Server
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});


