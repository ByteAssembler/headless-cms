import { sqliteTable, text, type AnySQLiteColumn, type AnySQLiteTable, type SQLiteColumnBuilderBase } from 'drizzle-orm/sqlite-core';
import { primaryKey } from 'drizzle-orm/sqlite-core';
import { defineIdField, defineTimestamps, type FieldDefinition } from '../core/content-fields';
import { allContentTypeConfigs, type ContentTypeConfig } from '../content-types';
import { defineAllDrizzleRelations } from '../core/schema-relations';

// ... rest of the file ...

// --- Phase 1: Basis-Tabellen und Join-Tabellen generieren ---

type TableWithId = AnySQLiteTable & { id: AnySQLiteColumn };
type ColumnsMap = Record<string, SQLiteColumnBuilderBase>;
const allTables: Record<string, AnySQLiteTable> = {};
const manyToManyRelations: { fromTable: string, toTable: string }[] = [];

console.log("Generating base tables...");

for (const apiIdentifier in allContentTypeConfigs) {
	const config = allContentTypeConfigs[apiIdentifier];
	const drizzleColumns: ColumnsMap = {
		id: defineIdField().column,
		createdAt: defineTimestamps().createdAt.column,
		updatedAt: defineTimestamps().updatedAt.column,
	};

	for (const fieldName in config.fields) {
		const field = config.fields[fieldName] as FieldDefinition<any, any, any, any>;
		if (field.column) {
			// Fix: Remove the check for '._' and directly use the column builder.
			// Determine the correct column name (usually field name, but FKs use convention like 'authorId')
			let columnName = fieldName;
			// Check if it's a relation field (many: false) to use the conventional FK name
			if (field.config && 'relationTo' in field.config && !field.config.many) {
				columnName = `${fieldName}Id`; // e.g., author -> authorId
			}
			// Ensure the builder itself has the name configured correctly internally by Drizzle's text(), integer() etc.
			// Add the builder to the map using the determined column name.
			drizzleColumns[columnName] = field.column;

		} else if (field.config && 'relationTo' in field.config && field.config.many) {
			manyToManyRelations.push({ fromTable: apiIdentifier, toTable: field.config.relationTo });
		}
	}

	allTables[apiIdentifier] = sqliteTable(apiIdentifier, drizzleColumns);
	console.log(`  Created base table: ${apiIdentifier}`);
}


console.log("Generating join tables...");
// ... (Rest des Codes für Join-Tabellen, Relationen und Exports bleibt gleich) ...

// Set zur Nachverfolgung bereits erstellter Join-Tabellen (verhindert Duplikate)
const createdJoinTables = new Set<string>();

// Schleife zum Generieren der Join-Tabellen für M2M-Relationen
for (const m2m of manyToManyRelations) {
	// Sortiere Tabellennamen alphabetisch für konsistenten Join-Tabellen-Namen
	const [tableA, tableB] = [m2m.fromTable, m2m.toTable].sort();
	const joinTableName = `${tableA}_to_${tableB}`; // z.B. categories_to_posts

	// Überspringen, falls diese Join-Tabelle schon erstellt wurde
	if (createdJoinTables.has(joinTableName)) {
		continue;
	}

	// Hole die ID-Spalten der zu verbindenden Tabellen
	const tableAIdColumn = (allTables[tableA] as TableWithId | undefined)?.id;
	const tableBIdColumn = (allTables[tableB] as TableWithId | undefined)?.id;

	// Fehler, falls eine der ID-Spalten nicht gefunden wird
	if (!tableAIdColumn || !tableBIdColumn) {
		console.error(`Could not find ID columns for join table ${joinTableName} between ${tableA} and ${tableB}`);
		continue;
	}

	// Definiere die Spalten der Join-Tabelle (Fremdschlüssel)
	const joinTableColumns = {
		[`${tableA}Id`]: text(`${tableA}Id`).notNull().references(() => tableAIdColumn), // FK zu Tabelle A
		[`${tableB}Id`]: text(`${tableB}Id`).notNull().references(() => tableBIdColumn), // FK zu Tabelle B
	};

	// Erstelle das Drizzle-Objekt für die Join-Tabelle
	allTables[joinTableName] = sqliteTable(joinTableName, joinTableColumns, (table) => {
		// Definiere einen zusammengesetzten Primärschlüssel für die Join-Tabelle
		return {
			pk: primaryKey({ columns: [table[`${tableA}Id`], table[`${tableB}Id`]] }),
		};
	});
	// Markiere die Join-Tabelle als erstellt
	createdJoinTables.add(joinTableName);
	console.log(`  Created join table: ${joinTableName}`);
}

// --- Phase 2: Drizzle Relationen definieren ---

console.log("Defining relations...");
// Rufe die Funktion auf, die die `relations`-Objekte generiert
const allGeneratedRelations = defineAllDrizzleRelations(allTables, allContentTypeConfigs);
console.log("  Relations defined.");

// --- Exports ---
// Exportiere alle Tabellen und Relationen, damit Drizzle sie nutzen kann

// Dynamischer Export aller Tabellen (nützlich für interne Zwecke)
export const schemaTables = allTables;
// Dynamischer Export aller Relationen (nützlich für interne Zwecke)
export const schemaRelations = allGeneratedRelations;

// Explizite Exports für Typsicherheit (WICHTIG für db.query und Code-Nutzung)
export const users = allTables['users'] as TableWithId;
export const posts = allTables['posts'] as TableWithId;
export const categories = allTables['categories'] as TableWithId;
export const posts_to_categories = allTables['posts_to_categories']; // Join-Tabelle

export const usersRelations = allGeneratedRelations['usersRelations'];
export const postsRelations = allGeneratedRelations['postsRelations'];
export const categoriesRelations = allGeneratedRelations['categoriesRelations'];
export const posts_to_categoriesRelations = allGeneratedRelations['posts_to_categoriesRelations']; // Join-Tabellen-Relationen

console.log("Schema generation complete.");

// Kombiniere Tabellen und Relationen für den Drizzle-Client
// Dieses Objekt wird an `drizzle(client, { schema })` übergeben
export const schema = {
	// Tabellen
	users,
	posts,
	categories,
	posts_to_categories,
	// Relationen
	usersRelations,
	postsRelations,
	categoriesRelations,
	posts_to_categoriesRelations,
};