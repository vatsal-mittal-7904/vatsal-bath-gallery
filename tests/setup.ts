process.env.DATABASE_URL = 'postgresql://vatsalmittal7904:pass@localhost:5433/testdb';
// @ts-expect-error NODE_ENV is readonly in Node types
process.env.NODE_ENV = 'test';
