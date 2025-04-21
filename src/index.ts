import 'dotenv/config';

import { Hono } from 'hono'
import { serve } from '@hono/node-server'

import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';

import { schema } from '@/output/database.schema';

const client = createClient({ url: process.env.DB_FILE_NAME! });
const db = drizzle(client, { schema });

const app = new Hono()

app.get('/', async (c) => {
  try {
    await db.insert(schema.users).values({
      name: 'John Doe',
      email: 'mail' + Math.random().toString(36).substring(2, 7) + '@example.com',
      emailVerified: false,
    });

    const users = await db.query.users.findMany();

    return c.json({ message: 'Hello Hono!', usersCount: users.length, users: users });
  } catch (error) {
    console.error("DB Query Error:", error);
    return c.json({ message: 'Hello Hono!', error: 'Could not query database' }, 500);
  }
})

serve({
  fetch: app.fetch,
  port: 3000
}, (info) => {
  console.log(`Server is running on http://localhost:${info.port}`)
})
