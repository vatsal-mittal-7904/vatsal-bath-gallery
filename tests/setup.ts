process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/testdb';
// @ts-expect-error NODE_ENV is readonly in Node types
process.env.NODE_ENV = 'test';
