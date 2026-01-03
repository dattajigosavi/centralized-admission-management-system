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

// Temporary call log data (like CALL_LOGS sheet)
const callLogs = [
    {
        call_id: 1,
        student_id: 1,
        teacher: "Teacher A",
        unit: "Engineering",
        call_status: "Completed",
        remarks: "Interested, asked for brochure"
    },
    {
        call_id: 2,
        student_id: 2,
        teacher: "Teacher B",
        unit: "Law",
        call_status: "Not Connected",
        remarks: "Phone switched off"
    },
    {
        call_id: 3,
        student_id: 3,
        teacher: "Teacher C",
        unit: "Nursing",
        call_status: "Completed",
        remarks: "Follow-up required"
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

// API to get all call logs (calls made by teachers)
app.get("/call-logs", (req, res) => {
    res.json(callLogs);
});

// API to get dashboard summary
app.get("/dashboard-summary", (req, res) => {

    // Total calls assigned
    const totalAssigned = assignments.length;

    // Calls completed
    const completedCalls = callLogs.filter(
        log => log.call_status === "Completed"
    ).length;

    // Pending calls
    const pendingCalls = totalAssigned - completedCalls;

    // Unit-wise summary
    const unitSummary = {};

    assignments.forEach(assign => {
        const unit = assign.unit;

        if (!unitSummary[unit]) {
            unitSummary[unit] = {
                assigned: 0,
                completed: 0
            };
        }

        unitSummary[unit].assigned += 1;
    });

    callLogs.forEach(log => {
        if (log.call_status === "Completed") {
            if (unitSummary[log.unit]) {
                unitSummary[log.unit].completed += 1;
            }
        }
    });

    // Teacher-wise summary
    const teacherSummary = {};

    assignments.forEach(assign => {
        const teacher = assign.teacher;

        if (!teacherSummary[teacher]) {
            teacherSummary[teacher] = {
                assigned: 0,
                completed: 0
            };
        }

        teacherSummary[teacher].assigned += 1;
    });

    callLogs.forEach(log => {
        if (log.call_status === "Completed") {
            if (teacherSummary[log.teacher]) {
                teacherSummary[log.teacher].completed += 1;
            }
        }
    });

    // Final response
    res.json({
        total_calls_assigned: totalAssigned,
        calls_completed: completedCalls,
        pending_calls: pendingCalls,
        unit_summary: unitSummary,
        teacher_summary: teacherSummary
    });
});

// Teacher-specific dashboard
app.get("/dashboard/teacher/:teacherName", (req, res) => {

    const teacherName = req.params.teacherName;

    // Calls assigned to this teacher
    const assigned = assignments.filter(
        a => a.teacher === teacherName
    ).length;

    // Calls completed by this teacher
    const completed = callLogs.filter(
        log => log.teacher === teacherName && log.call_status === "Completed"
    ).length;

    // Pending calls
    const pending = assigned - completed;

    res.json({
        teacher: teacherName,
        calls_assigned: assigned,
        calls_completed: completed,
        pending_calls: pending
    });
});

// Unit-specific dashboard (Local Admin)
app.get("/dashboard/unit/:unitName", (req, res) => {

    const unitName = req.params.unitName;

    // Calls assigned in this unit
    const assigned = assignments.filter(
        a => a.unit === unitName
    ).length;

    // Calls completed in this unit
    const completed = callLogs.filter(
        log => log.unit === unitName && log.call_status === "Completed"
    ).length;

    // Pending calls
    const pending = assigned - completed;

    res.json({
        unit: unitName,
        calls_assigned: assigned,
        calls_completed: completed,
        pending_calls: pending
    });
});


// Start the server
const PORT = 3000;
app.listen(PORT, () => {
    console.log("Server started on port " + PORT);
});
