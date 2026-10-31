import { DatabaseSync } from 'node:sqlite'
import m001 from './migrations/001_init.sql?raw'

const migrations = [m001]

export type Db = DatabaseSync

export function openDb(path: string): Db {
  const db = new DatabaseSync(path)
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;')
  migrate(db)
  return db
}

export function migrate(db: Db): void {
  const { user_version: current } = db.prepare('PRAGMA user_version').get() as { user_version: number }
  for (let v = current; v < migrations.length; v++) {
    transaction(db, () => {
      db.exec(migrations[v])
      db.exec(`PRAGMA user_version = ${v + 1}`)
    })
  }
}

export function transaction<T>(db: Db, fn: () => T): T {
  db.exec('BEGIN')
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

export function now(): string {
  return new Date().toISOString()
}
