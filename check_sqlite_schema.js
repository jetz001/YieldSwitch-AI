const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./prisma/dev.db');

db.all("PRAGMA table_info(BotConfig)", (err, rows) => {
  if (err) {
    console.error(err);
  } else {
    console.log('--- BotConfig Table Info ---');
    rows.forEach(row => {
      console.log(`Column: ${row.name}, Type: ${row.type}`);
    });
  }
  db.close();
});
