// backend/app.js
// Main server file for Centralized Admission Management System

const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const { Pool } = require("pg");



const app = express();
app.use(cors());
app.use(express.json());

/* =========================
   DATABASE CONNECTION
========================= */
const pool = new Pool(
  process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false } // Cloud only
      }
    : {
        user: "postgres",
        host: "localhost",
        database: "admission_system",
        password: "postgres123", // your local DB password
        port: 5432
      }
);
/* =========================
   For log generation
========================= */

const logAudit = async (action, performedBy, role, target = null) => {
  try {
    await pool.query(
      `
      INSERT INTO audit_logs (action, performed_by, role, target)
      VALUES ($1, $2, $3, $4)
      `,
      [action, performedBy, role, target]
    );
  } catch (err) {
    console.error("Audit log error:", err);
  }
};


/* =========================
   TEST ROUTE
========================= */
app.get("/", (req, res) => {
  res.send("Admission Management Backend is running");
});

/* =========================
   STUDENTS
========================= */
app.get("/students", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM students");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send("Database error");
  }
});

/* =========================
   ASSIGNMENTS
========================= */
app.get("/assignments", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM assignments");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send("Database error");
  }
});

/* =========================
   CALL LOGS
========================= */
app.get("/call-logs", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM call_logs");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send("Database error");
  }
});

/* =========================
   DASHBOARD SUMMARY
========================= */
app.get("/dashboard-summary", async (req, res) => {
  try {
    const assignedRes = await pool.query("SELECT COUNT(*) FROM assignments");
    const completedRes = await pool.query(
      "SELECT COUNT(*) FROM call_logs WHERE call_status='Completed'"
    );

    const totalAssigned = parseInt(assignedRes.rows[0].count);
    const completedCalls = parseInt(completedRes.rows[0].count);
    const pendingCalls = totalAssigned - completedCalls;

    const unitSummaryRes = await pool.query(`
      SELECT unit,
             COUNT(*) AS assigned,
             COUNT(CASE WHEN call_status='Completed' THEN 1 END) AS completed
      FROM assignments
      LEFT JOIN call_logs USING (student_id, unit)
      GROUP BY unit
    `);

    const teacherSummaryRes = await pool.query(`
      SELECT teacher,
             COUNT(*) AS assigned,
             COUNT(CASE WHEN call_status='Completed' THEN 1 END) AS completed
      FROM assignments
      LEFT JOIN call_logs USING (student_id, teacher)
      GROUP BY teacher
    `);

    res.json({
      total_calls_assigned: totalAssigned,
      calls_completed: completedCalls,
      pending_calls: pendingCalls,
      unit_summary: unitSummaryRes.rows,
      teacher_summary: teacherSummaryRes.rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Dashboard error");
  }
});


// GET ALL USERS (SUPER ADMIN)
app.get("/users", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT user_id, username, role, teacher_name, unit, is_active FROM users ORDER BY user_id"
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching users" });
  }
});


// Disabled user instantly logged out
app.get("/login-check", async (req, res) => {
  const username = req.headers["x-username"];

  const result = await pool.query(
    "SELECT is_active FROM users WHERE username=$1",
    [username]
  );

  if (!result.rows[0] || result.rows[0].is_active === false) {
    return res.sendStatus(403);
  }

  res.sendStatus(200);
});

// ENABLE / DISABLE USER
app.put("/users/:id/status", async (req, res) => {
  const { is_active } = req.body;
  const userId = req.params.id;

  try {
    // Prevent disabling last SUPER_ADMIN
    const adminCheck = await pool.query(
      "SELECT COUNT(*) FROM users WHERE role='SUPER_ADMIN' AND is_active=true"
    );

    const targetUser = await pool.query(
      "SELECT role FROM users WHERE user_id=$1",
      [userId]
    );

    if (
      targetUser.rows[0].role === "SUPER_ADMIN" &&
      adminCheck.rows[0].count <= 1 &&
      is_active === false
    ) {
      return res.status(400).json({
        message: "Cannot disable the last active SUPER_ADMIN"
      });
    }

    await pool.query(
      "UPDATE users SET is_active=$1 WHERE user_id=$2",
      [is_active, userId]
    );

	await logAudit(
	  is_active ? "ENABLE_USER" : "DISABLE_USER",
	  "SUPER_ADMIN",
	  "SUPER_ADMIN",
	  `user_id:${userId}`
	);


    res.json({ message: "User status updated" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error updating user status" });
  }
});

// RESET USER PASSWORD (SUPER ADMIN)
app.put("/users/:id/reset-password", async (req, res) => {
  const userId = req.params.id;
  const { newPassword } = req.body;

  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({
      message: "Password must be at least 6 characters"
    });
  }

  try {
    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await pool.query(
      "UPDATE users SET password=$1 WHERE user_id=$2",
      [hashedPassword, userId]
    );

	await logAudit(
	  "RESET_PASSWORD",
	  "SUPER_ADMIN",
	  "SUPER_ADMIN",
	  `user_id:${userId}`
	);


    res.json({ message: "Password reset successful" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Password reset failed" });
  }
});


// GET AUDIT LOGS (SUPER ADMIN)
app.get("/audit-logs", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 200"
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching audit logs" });
  }
});


/* =========================
   TEACHER – ASSIGNED STUDENTS
========================= */
app.get("/teacher/students", async (req, res) => {
  const teacher = req.query.teacher;

  try {
    const result = await pool.query(
      `
      SELECT s.student_id, s.name, s.mobile, s.preferred_branch, s.status
      FROM students s
      JOIN assignments a ON s.student_id = a.student_id
      WHERE a.teacher = $1
      `,
      [teacher]
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error fetching teacher students");
  }
});

/* =========================
   CALL UPDATE
========================= */
app.post("/call-update", async (req, res) => {
  const { student_id, teacher, unit, call_status, remarks } = req.body;

  try {
    await pool.query(
      `
      INSERT INTO call_logs (student_id, teacher, unit, call_status, remarks)
      VALUES ($1, $2, $3, $4, $5)
      `,
      [student_id, teacher, unit, call_status, remarks]
    );

    await pool.query(
      "UPDATE students SET status = $1 WHERE student_id = $2",
      [call_status, student_id]
    );

	await logAudit(
	  "CALL_UPDATE",
	  teacher,
	  "TEACHER",
	  `student_id:${student_id}`
	);


    res.json({ message: "Call updated successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error saving call update");
  }
});

/* =========================
   LOGIN (bcrypt)
========================= */
app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  try {
    const result = await pool.query(
      "SELECT user_id, username, password, role, teacher_name, unit FROM users WHERE username=$1",
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const user = result.rows[0];
	
	if (user.is_active === false) {
	  return res.status(403).json({ message: "User account is disabled" });
	}

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    delete user.password;
    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Login error" });
  }
});

/* =========================
   CREATE USER (PASSWORD HASHED)
========================= */
app.post("/users", async (req, res) => {
  const { username, password, role, teacher_name, unit } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    await pool.query(
      `
      INSERT INTO users (username, password, role, teacher_name, unit)
      VALUES ($1, $2, $3, $4, $5)
      `,
      [username, hashedPassword, role, teacher_name || null, unit || null]
    );
	
	await logAudit(
	  "CREATE_USER",
	  "SUPER_ADMIN",
	  "SUPER_ADMIN",
	  username
	);

	
    res.json({ message: "User created successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error creating user" });
  }
});

/* =========================
   START SERVER
========================= */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});
