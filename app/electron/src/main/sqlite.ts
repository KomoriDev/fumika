import type { Selection } from '@cordisjs/plugin-database'
import { executeUpdate } from '@cordisjs/plugin-database'
import SQLiteDriver from '@cordisjs/plugin-database-sqlite'

/**
 * Stock `_update` dumps uuid PKs to Uint8Array, then `parseQuery` treats that
 * buffer as an operator object and emits `WHERE 1`. Token refresh then
 * overwrites every `mail_credential` row.
 */
export default class FumikaSQLiteDriver extends SQLiteDriver {
  override _update(sel: Selection.Mutable, indexFields: string[], updateFields: string[], update: Record<string, unknown>, data: Record<string, unknown>): void {
    const { ref, table, model } = sel
    executeUpdate(data, update, ref)
    const row = this.sql.dump(data, model) as Record<string, unknown>
    const assignment = updateFields.map(key => `${this.sql.escapeId(key)} = ?`).join(',')
    const filter = indexFields.map((key) => {
      const value = row[key]
      if (value === undefined || value === null)
        return `${this.sql.escapeId(key)} IS NULL`
      return `${this.sql.escapeId(key)} = ${this.sql.escapePrimitive(value)}`
    }).join(' AND ') || '1'
    this._run(
      `UPDATE ${this.sql.escapeId(table)} SET ${assignment} WHERE ${filter}`,
      updateFields.map(key => row[key] ?? null),
    )
  }
}
