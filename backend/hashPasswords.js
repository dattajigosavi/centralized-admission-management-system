const bcrypt = require("bcrypt");
const { Pool } = require("pg");

const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "admission_system",
  password: "postgres123",
  port: 5432,
});

async function hashPasswords() {
  const users = await pool.query("SELECT user_id, password FROM users");

  for (let user of users.rows) {
    const hashed = await bcrypt.hash(user.password, 10);
    await pool.query(
      "UPDATE users SET password=$1 WHERE user_id=$2",
      [hashed, user.user_id]
    );
  }

  console.log("All passwords hashed");
  process.exit();
}

hashPasswords();
