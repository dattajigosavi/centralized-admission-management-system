// backend/app.js
// Centralized Admission Management System — FINAL BACKEND

const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const { Pool } = require("pg");
const multer = require("multer");
const csv = require("csv-parser");
const fs = require("fs");

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
        ssl: { rejectUnauthorized: false }
      }
    : {
        user: "postgres",
        host: "localhost",
        database: "admission_system",
        password: "postgres123",
        port: 5432
      }
);

/* =========================
   AUDIT LOG HELPER
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
   CSV IMPORT (STUDENTS)
========================= */
const upload = multer({ dest: "uploads/" });

app.post("/students/import", upload.single("file"), async (req, res) => {
	if (!req.file) {
		return res.status(400).json({ message: "No file uploaded" });
	  }
  const results = [];

  try {
    fs.createReadStream(req.file.path)
      .pipe(csv())
      .on("data", data => results.push(data))
      .on("end", async () => {
        for (const row of results) {
          if (!row.name || !row.mobile) continue;

          const studentRes = await pool.query(
			  `
			  INSERT INTO students (name, mobile, address, preferred_unit)
			  VALUES ($1, $2, $3, $4)
			  ON CONFLICT (mobile)
			  DO UPDATE SET
				preferred_unit = COALESCE(EXCLUDED.preferred_unit, students.preferred_unit)
			  RETURNING student_id
			  `,
			  [
				row.name,
				row.mobile,
				row.address || null,
				row.preferred_unit || null
			  ]
			);

			const studentId = studentRes.rows[0].student_id;
			
			const assignmentRes = await pool.query(
			  "SELECT assignment_id, unit FROM assignments WHERE student_id = $1",
			  [studentId]
			);
			
			// Determine unit for assignment
			const unitToAssign = row.preferred_unit || null;

			if (assignmentRes.rows.length === 0) {
			  // 🔹 Fresh assignment
			  await pool.query(
				`
				INSERT INTO assignments
				(student_id, unit, assigned_to_role, assigned_by_role, assigned_by)
				VALUES ($1, $2, 'SUPER_ADMIN', 'SYSTEM', 'CSV_IMPORT')
				`,
				[studentId, unitToAssign]
			  );
			} else {
			  // 🔹 Fix broken / NULL assignment
			  if (!assignmentRes.rows[0].unit && unitToAssign) {
				await pool.query(
				  `
				  UPDATE assignments
				  SET unit = $1,
					  teacher = NULL,
					  assigned_to_role = 'SUPER_ADMIN',
					  assigned_by_role = 'SYSTEM',
					  assigned_by = 'CSV_IMPORT'
				  WHERE student_id = $2
				  `,
				  [unitToAssign, studentId]
				);
			  }
			}



        }

        await logAudit(
          "CSV_IMPORT_STUDENTS",
          "SUPER_ADMIN",
          "SUPER_ADMIN",
          `${results.length} rows`
        );

        res.json({ count: results.length });
      });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "CSV import failed" });
  }
});

/* =========================
   CSV IMPORT (Users)
========================= */
app.post("/users/import", upload.single("file"), async (req, res) => {
	if (!req.file) {
    return res.status(400).json({ message: "No file uploaded" });
  }
  const users = [];

  try {
    fs.createReadStream(req.file.path)
      .pipe(csv())
      .on("data", (row) => users.push(row))
      .on("end", async () => {
        let inserted = 0;

        for (const u of users) {
          if (!u.username || !u.password || !u.role) continue;

          const hashedPassword = await bcrypt.hash(u.password, 10);

          await pool.query(
            `
            INSERT INTO users
            (username, password, role, teacher_name, unit)
            VALUES ($1,$2,$3,$4,$5)
            ON CONFLICT (username) DO NOTHING
            `,
            [
              u.username,
              hashedPassword,
              u.role,
              u.teacher_name || null,
              u.unit || null
            ]
          );

          inserted++;
        }

        await logAudit(
          "CSV_IMPORT_USERS",
          "SUPER_ADMIN",
          "SUPER_ADMIN",
          `users:${inserted}`
        );

        res.json({
          message: "Users imported successfully",
          inserted
        });
      });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "User CSV import failed" });
  }
});


/* =========================
   TEST ROUTE
========================= */
app.get("/", (_, res) => {
  res.send("Admission Management Backend is running");
});

/* =========================
   DASHBOARD SUMMARY
========================= */
app.get("/dashboard-summary", async (_, res) => {
  try {
    const totalAssignedRes = await pool.query(`
	  SELECT COUNT(DISTINCT a.student_id)
	  FROM assignments a
	  WHERE a.unit IS NOT NULL
	`);
	
    const completedAssignedRes = await pool.query(`
	  SELECT COUNT(DISTINCT a.student_id)
	  FROM assignments a
	  JOIN students s ON s.student_id = a.student_id
	  WHERE a.unit IS NOT NULL
		AND s.status = 'Completed'
	`);
	const totalAssigned = Number(totalAssignedRes.rows[0].count);
	const completedAssigned = Number(completedAssignedRes.rows[0].count);
	const pendingAssigned = totalAssigned - completedAssigned;


    const unitSummary = await pool.query(`
	  SELECT 
		a.unit,
		COUNT(DISTINCT a.student_id) AS assigned,
		COUNT(
		  CASE WHEN s.status = 'Completed' THEN 1 END
		) AS completed
	  FROM assignments a
	  JOIN students s ON s.student_id = a.student_id
	  WHERE a.unit IS NOT NULL
	  GROUP BY a.unit
	`);


    const teacherSummary = await pool.query(`
	  SELECT 
		a.teacher,
		COUNT(DISTINCT a.student_id) AS assigned,
		COUNT(
		  CASE WHEN s.status = 'Completed' THEN 1 END
		) AS completed
	  FROM assignments a
	  JOIN students s ON s.student_id = a.student_id
	  WHERE a.unit IS NOT NULL
		AND a.teacher IS NOT NULL
	  GROUP BY a.teacher
    `);


    res.json({
  total_students: totalAssigned,
  completed_students: completedAssigned,
  pending_students: pendingAssigned,
  unit_summary: unitSummary.rows,
  teacher_summary: teacherSummary.rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Dashboard error" });
  }
});

/* =========================
   TEACHER PERFORMANCE
========================= */
app.get("/teacher/performance/:teacher", async (req, res) => {
  const teacher = req.params.teacher;

  try {
    const total = await pool.query(
      "SELECT COUNT(DISTINCT student_id) FROM call_logs WHERE teacher=$1",
      [teacher]
    );

    const completed = await pool.query(
      `
      SELECT COUNT(DISTINCT student_id)
      FROM call_logs
      WHERE teacher=$1 AND call_status='Completed'
      `,
      [teacher]
    );

    res.json({
      total_called: Number(total.rows[0].count),
      completed_by_me: Number(completed.rows[0].count)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Performance error" });
  }
});

/* =========================
   USERS
========================= */
app.get("/users", async (_, res) => {
  const result = await pool.query(
    `
    SELECT user_id, username, role, teacher_name, unit, is_active
    FROM users
    ORDER BY user_id
    `
  );
  res.json(result.rows || []);
});

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

app.put("/users/:id/status", async (req, res) => {
  const { is_active } = req.body;
  const userId = req.params.id;

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

  res.json({ success: true });
});

app.put("/users/:id/reset-password", async (req, res) => {
  const hash = await bcrypt.hash(req.body.newPassword, 10);
  await pool.query(
    "UPDATE users SET password=$1 WHERE user_id=$2",
    [hash, req.params.id]
  );
  res.json({ success: true });
});

/* =========================
   LOGIN
========================= */
app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  const result = await pool.query(
    `
    SELECT user_id, username, password, role, teacher_name, unit, is_active
    FROM users
    WHERE username=$1
    `,
    [username]
  );

  if (!result.rows.length) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  const user = result.rows[0];

  if (!user.is_active) {
    return res.status(403).json({ message: "Account disabled" });
  }

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  delete user.password;
  res.json(user);
});

/* =========================
   TEACHER STUDENTS
========================= */
app.get("/teacher/students", async (req, res) => {
  const teacher = req.query.teacher;

  const result = await pool.query(
    `
    SELECT s.student_id, s.name, s.mobile, s.address,
           s.preferred_unit, s.status
    FROM students s
    JOIN assignments a ON a.student_id = s.student_id
    WHERE a.teacher = $1
    `,
    [teacher]
  );

  res.json(result.rows || []);
});

/* =========================
   PREFERRED UNIT UPDATE
========================= */
app.put("/student/preferred-unit", async (req, res) => {
  const { student_id, preferred_unit, teacher } = req.body;

  await pool.query(
    "UPDATE students SET preferred_unit=$1 WHERE student_id=$2",
    [preferred_unit, student_id]
  );

  await logAudit(
    "PREFERRED_UNIT_CHANGED",
    teacher,
    "TEACHER",
    `student_id:${student_id}`
  );

  res.json({ success: true });
});

/* =========================
   REASSIGNMENT
========================= */
app.get("/admin/reassignment-queue", async (_, res) => {
  const result = await pool.query(`
    SELECT s.student_id, s.name, s.mobile,
           s.preferred_unit, a.unit AS assigned_unit, a.teacher
    FROM students s
    JOIN assignments a ON a.student_id = s.student_id
    WHERE s.preferred_unit IS NOT NULL
      AND s.preferred_unit <> a.unit
  `);

  res.json(result.rows || []);
});

app.get("/admin/teachers-by-unit/:unit", async (req, res) => {
  const result = await pool.query(
    `
    SELECT teacher_name
    FROM users
    WHERE role='TEACHER'
      AND unit=$1
      AND is_active=true
    `,
    [req.params.unit]
  );

  res.json(result.rows || []);
});

/* =========================
   SUPER ADMIN → SET INITIAL UNIT
========================= */
app.put("/admin/set-student-unit", async (req, res) => {
  const { student_id, unit, admin } = req.body;

  try {
    await pool.query(
      "UPDATE students SET preferred_unit = $1 WHERE student_id = $2",
      [unit, student_id]
    );

    await logAudit(
      "SET_INITIAL_UNIT",
      admin,
      "SUPER_ADMIN",
      `student_id:${student_id} → ${unit}`
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Unit update failed" });
  }
});



/* =========================
   GET SUB ADMINS BY UNIT
========================= */
app.get("/admin/subadmins-by-unit/:unit", async (req, res) => {
  const unit = req.params.unit;

  try {
    const result = await pool.query(
      `
      SELECT username
      FROM users
      WHERE role = 'SUB_ADMIN'
        AND unit = $1
        AND is_active = true
      ORDER BY username
      `,
      [unit]
    );

    // Return array of usernames
    res.json(result.rows.map(r => r.username));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching sub admins" });
  }
});



app.put("/admin/reassign-student", async (req, res) => {
  const { student_id, new_unit, new_teacher, admin } = req.body;

  await pool.query(
    `
    UPDATE assignments
    SET unit=$1, teacher=$2
    WHERE student_id=$3
    `,
    [new_unit, new_teacher, student_id]
  );

  await logAudit(
    "STUDENT_REASSIGNED",
    admin,
    "SUPER_ADMIN",
    `student_id:${student_id}`
  );

  res.json({ success: true });
});

// SUPER ADMIN – UNASSIGNED STUDENTS
app.get("/admin/unassigned-students", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
		  s.student_id,
		  s.name,
		  s.mobile,
		  s.preferred_unit
		FROM students s
		LEFT JOIN assignments a ON a.student_id = s.student_id
		WHERE a.assignment_id IS NULL
		   OR a.assigned_to_role <> 'SUB_ADMIN';
    `);

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json([]);
  }
});



/* =========================
   unassigned students
========================= */
app.get("/admin/unassigned-students", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT s.student_id, s.name, s.mobile, s.preferred_unit
      FROM students s
      LEFT JOIN assignments a
        ON s.student_id = a.student_id
      WHERE a.student_id IS NULL
      ORDER BY s.student_id DESC
    `);

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching unassigned students" });
  }
});

// SUPER ADMIN → UNASSIGNED STUDENTS
app.get("/admin/unassigned-students", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        s.student_id,
        s.name,
        s.mobile,
        s.preferred_unit
      FROM students s
      LEFT JOIN assignments a
        ON s.student_id = a.student_id
      WHERE a.student_id IS NULL
    `);

    res.json(result.rows || []);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch unassigned students" });
  }
});

// SUPER ADMIN → SUB ADMINS BY UNIT
app.get("/admin/subadmins-by-unit/:unit", async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT username
      FROM users
      WHERE role = 'SUB_ADMIN'
        AND unit = $1
        AND is_active = true
      `,
      [req.params.unit]
    );

    res.json(result.rows || []);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch sub admins" });
  }
});


/* =========================
   SUPER ADMIN → SUB ADMIN ASSIGN
========================= */
app.post("/admin/assign-to-subadmin", async (req, res) => {
  const { student_id, unit, sub_admin, admin } = req.body;

  try {
    const exists = await pool.query(
      "SELECT assignment_id FROM assignments WHERE student_id=$1",
      [student_id]
    );

    if (exists.rows.length === 0) {
      // INSERT new assignment
      await pool.query(
        `
        INSERT INTO assignments
        (student_id, unit, teacher, assigned_to_role, assigned_by_role, assigned_by)
        VALUES ($1,$2,$3,'SUB_ADMIN','SUPER_ADMIN',$4)
        `,
        [student_id, unit, sub_admin, admin]
      );
    } else {
      // UPDATE existing (even if NULL / broken)
      await pool.query(
        `
        UPDATE assignments
        SET
          unit = $1,
          teacher = $2,
          assigned_to_role = 'SUB_ADMIN',
          assigned_by_role = 'SUPER_ADMIN',
          assigned_by = $3
        WHERE student_id = $4
        `,
        [unit, sub_admin, admin, student_id]
      );
    }

    await logAudit(
      "ASSIGN_TO_SUB_ADMIN",
      admin,
      "SUPER_ADMIN",
      `student_id:${student_id} -> ${sub_admin}`
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Assignment failed" });
  }
});



/* =========================
   UNASSIGNED STUDENTS (SUPER ADMIN)
========================= */
app.get("/admin/unassigned-students", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        s.student_id,
        s.name,
        s.mobile,
        s.preferred_unit
      FROM students s
      LEFT JOIN assignments a
        ON a.student_id = s.student_id
      WHERE
        a.student_id IS NULL
        OR a.assigned_to_role IS NULL
        OR (
          a.assigned_to_role = 'SUB_ADMIN'
          AND a.sub_admin IS NULL
        )
    `);

    res.json(result.rows || []);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch unassigned students" });
  }
});




/* =========================
   CALL UPDATE
========================= */
app.post("/call-update", async (req, res) => {
  const { student_id, teacher, unit, call_status, remarks, address } = req.body;

  const current = await pool.query(
    "SELECT status FROM students WHERE student_id=$1",
    [student_id]
  );

  const finalStatus =
    current.rows[0].status === "Completed"
      ? "Completed"
      : call_status;

  await pool.query(
    `
    INSERT INTO call_logs (student_id, teacher, unit, call_status, remarks)
    VALUES ($1,$2,$3,$4,$5)
    `,
    [student_id, teacher, unit, finalStatus, remarks || null]
  );

  await pool.query(
    `
    UPDATE students
    SET status=$1, address=COALESCE($2,address)
    WHERE student_id=$3
    `,
    [finalStatus, address || null, student_id]
  );

  await logAudit(
    "CALL_UPDATE",
    teacher,
    "TEACHER",
    `student_id:${student_id}`
  );

  res.json({ success: true });
});

/* =========================
   START SERVER
========================= */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`Server started on port ${PORT}`)
);
