// backend/app.js
// Main server file for Centralized Admission Management System

const express = require("express");
const app = express();

// This route runs when someone opens the root URL
app.get("/", (req, res) => {
    res.send("Admission Management Backend is running");
});

// Start the server
const PORT = 3000;
app.listen(PORT, () => {
    console.log("Server started on port " + PORT);
});
