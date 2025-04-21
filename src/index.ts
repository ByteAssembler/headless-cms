import 'dotenv/config';

import { Hono } from 'hono'
import { serve } from '@hono/node-server'

import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';

import { schema } from './db/schema';

const client = createClient({ url: process.env.DB_FILE_NAME! });
const db = drizzle(client, { schema });

const app = new Hono()

app.get('/', async (c) => {
  try {
    const users = await db.query.users.findMany();

    if (users.length === 0) {
      // Provide values for all required fields (name and email)
      await db.insert(schema.users).values({
        name: 'John Doe',
        email: 'john.doe@example.com' // Added required email field
      });
      console.log("Inserted initial user.");
      // Optionally, you might want to query again or return a different message
      return c.json({ message: 'Initial user created as DB was empty.' });
    }

    console.log("Users:", users);
    return c.json({ message: 'Hello Hono!', usersCount: users.length });
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
