// Typical usage:
// mongosh --file mongodb/databases/DropXFDatabases.js

const dbsToDrop = ['xforge', 'xforge_machine', 'sf_jobs'];

const conn = new Mongo();
let db = conn.getDB('xforge');
const existingDBNames = db.adminCommand('listDatabases').databases.map(db => db.name);
const dbNames = dbsToDrop.filter(name => existingDBNames.includes(name));

if (dbNames.length === 0) {
  console.log('No dbs to drop');
} else {
  console.log(`Going to drop ${dbNames.join(', ')}`);

  for (const name of dbNames) {
    db = conn.getDB(name);
    db.dropDatabase();
    console.log(`Dropped ${name}`);
  }

  console.log('Done');
}
