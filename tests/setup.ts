process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/testdb';
Object.defineProperty(process.env, 'NODE_ENV', { value: 'test' });
