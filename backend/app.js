// backend/app.js
// Main server file for Centralized Admission Management System

const express = require("express");
const app = express();

// Temporary student data (like Google Sheets)
const students = [
    {
        student_id: 1,
        name: "Rahul Patil",
        mobile: "9876543210",
        preferred_branch: "B.Tech Engineering",
        assigned_unit: "Engineering",
        status: "New"
    },
    {
        student_id: 2,
        name: "Sneha Joshi",
        mobile: "9123456789",
        preferred_branch: "LLB",
        assigned_unit: "Law",
        status: "Called"
    }
];

// Temporary assignment data (like ASSIGNMENTS sheet)
const assignments = [
    {
        assignment_id: 1,
        student_id: 1,
        teacher: "Teacher A",
        unit: "Engineering",
        status: "Active"
    },
    {
        assignment_id: 2,
        student_id: 2,
        teacher: "Teacher B",
        unit: "Law",
        status: "Active"
    },
    {
        assignment_id: 3,
        student_id: 3,
        teacher: "Teacher C",
        unit: "Nursing",
        status: "Active"
    }
];


// This route runs when someone opens the root URL
app.get("/", (req, res) => {
    res.send("Admission Management Backend is running");
});

// API to get all students
app.get("/students", (req, res) => {
    res.json(students);
});

// API to get all assignments (calls assigned)
app.get("/assignments", (req, res) => {
    res.json(assignments);
});


// Start the server
const PORT = 3000;
app.listen(PORT, () => {
    console.log("Server started on port " + PORT);
});
