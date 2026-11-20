const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/authRoutes");
const jobRoutes = require("./routes/jobRoutes");
const adminRoutes = require("./routes/adminRoutes");
const studentRoutes = require("./routes/studentRoutes");

// The Express app on its own. server.js runs it on a port for local
// development; lambda.js runs it inside AWS Lambda.
const app = express();

// ALLOWED_ORIGINS: comma-separated frontend URLs, or * to allow any site
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "*")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

// Middleware
app.use(cors(allowedOrigins.includes("*") ? {} : { origin: allowedOrigins }));
app.use(express.json({ limit: "100kb" }));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/jobs", jobRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/students", studentRoutes);

// Home Route
app.get("/", (req, res) => {
    res.send("CampusConnect Backend is Running Successfully!");
});

// Errors not handled by a route, such as a request body that isn't valid JSON
app.use((error, req, res, next) => {
    if (error.type === "entity.parse.failed") {
        return res.status(400).json({ message: "Request body is not valid JSON." });
    }

    if (error.type === "entity.too.large") {
        return res.status(413).json({ message: "Request body is too large." });
    }

    console.error("Unhandled Error:", error);
    res.status(500).json({ message: "Something went wrong." });
});

module.exports = app;
