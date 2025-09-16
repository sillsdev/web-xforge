import * as fs from 'fs';
import * as path from 'path';

describe('RealtimeServer migration tests', () => {
  /**
   * This is a meta-test that ensures that every migration in the RealtimeServer has a corresponding test.
   *
   * Tests are not required for all bugs or features, but writing migrations for tests is usually quite easy and the
   * costs of a broken migration is quite high.
   */
  it('tests every migration', () => {
    const realtimeDir = path.join(__dirname, '../..');

    const dirs = fs.readdirSync(realtimeDir).filter(dir => fs.statSync(path.join(realtimeDir, dir)).isDirectory());
    const migrationFiles: string[] = dirs
      .map(dir => {
        const serviceDir = path.join(realtimeDir, dir, 'services');
        if (fs.existsSync(serviceDir)) {
          const files = fs.readdirSync(serviceDir).filter(file => file.endsWith('-migrations.ts'));
          return files.map(file => path.join(serviceDir, file));
        } else return [];
      })
      .flat();

    for (const migrationFile of migrationFiles) {
      const content = fs.readFileSync(migrationFile, 'utf-8');
      // Skip files with no migrations
      if (content.includes('monotonicallyIncreasingMigrationList([])')) continue;
      // Find the highest migration number
      const migrationNumbers = Array.from(content.matchAll(/class \w+Migration(\d+)/g)).map(match =>
        parseInt(match[1], 10)
      );
      const maxMigrationNumber = Math.max(...migrationNumbers);

      const specFileName = migrationFile.replace('.ts', '.spec.ts');
      if (!fs.existsSync(specFileName)) throw new Error(`Missing spec file for ${migrationFile}`);

      const specContent = fs.readFileSync(specFileName, 'utf-8');

      for (let i = 1; i <= maxMigrationNumber; i++) {
        if (!specContent.includes(`describe('version ${i}',`)) {
          throw new Error(`Missing test for version ${i} in ${specFileName}`);
        }
      }
    }
  });
});
