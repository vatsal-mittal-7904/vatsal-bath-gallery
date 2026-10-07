process.env.DATABASE_URL = 'postgresql://vatsal_db_user:vatsal_db_password@localhost:5433/testdb';
// @ts-expect-error NODE_ENV is readonly in Node types
process.env.NODE_ENV = 'test';
