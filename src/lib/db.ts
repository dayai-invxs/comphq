import postgres from 'postgres'

// prepare: false required for pgbouncer (transaction pooling mode)
export const sql = postgres(process.env.DATABASE_URL!, { prepare: false })
