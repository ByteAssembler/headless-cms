import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	out: './drizzle',
	schema: 'src/generated/drizzle/',
	dialect: 'postgresql',
	dbCredentials: {
		url: process.env.DB_FILE_NAME!,
	},
});
