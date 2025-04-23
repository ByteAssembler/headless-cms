/**
 * zodSchemaCodeGenerator.ts
 *
 * Generiert TypeScript-Code (als String) für eine Datei, die Zod-Validierungsschemas
 * basierend auf einer ContentTypeDefinition definiert.
 * Erzeugt Schemas für Create-, Update- und Output-Szenarien sowie abgeleitete Typen.
 */

import type {
	ContentTypeDefinition,
	FieldDefinition,
	TextField,
	NumberField,
	DateField,
	RelationField,
	BooleanField,
	JsonField,
	MediaField,
	RichTextField,
	IdField,
	BaseField,
} from '../fields/types'; // Annahme: Typen sind in types.ts
import _ from 'lodash'; // Für _.upperFirst, _.camelCase (optional)

// =============================================================================
// Hilfsfunktionen für die Code-Generierung
// =============================================================================

/**
 * Formatiert einen Default-Wert für die Einbettung in den generierten Code-String.
 */
function formatDefaultValueForCode(value: any): string {
	if (typeof value === 'string') {
		// Escape backticks, backslashes, and template literal placeholders ${}
		const escapedValue = value
			.replace(/\\/g, '\\\\') // Escape backslashes first
			.replace(/`/g, '\\`')  // Escape backticks
			.replace(/\$\{/g, '\\${'); // Escape ${
		return `\`${escapedValue}\``; // Use backticks for potentially multi-line strings
	}
	if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
		return String(value);
	}
	if (value === 'now' && typeof value === 'string') {
		// Spezieller Fall für Date default 'now' -> wird zur Laufzeit ausgewertet
		return 'new Date()'; // Erzeugt ein neues Datum bei der Validierung
	}
	if (value instanceof Date) {
		return `new Date('${value.toISOString()}')`;
	}
	if (typeof value === 'object') {
		try {
			// Behandelt einfache Objekte/Arrays. Vorsicht bei komplexen Objekten oder Funktionen.
			return JSON.stringify(value);
		} catch (e) {
			console.warn(`Konnte Default-Objekt nicht serialisieren: ${e}`);
			return 'undefined'; // Oder Fehler werfen?
		}
	}
	return 'undefined'; // Fallback
}


/**
 * Erzeugt den String für den Basis-Zod-Typ eines Feldes, bevor
 * Lokalisierung oder Optionalität/Defaults angewendet werden.
 */
function getBaseZodTypeString(field: FieldDefinition): string {
	switch (field.fieldType) {
		case 'id':
			const idStrategy = (field as IdField).options.strategy;
			return idStrategy === 'autoincrement' ? `z.number().int().positive()` : `z.string()`; // UUIDs/CUIDs sind strings

		case 'text':
			let chain = 'z.string()';
			const textField = field as TextField;
			if (textField.options.minLength !== undefined) {
				chain += `.min(${textField.options.minLength})`;
			}
			if (textField.options.maxLength !== undefined) {
				chain += `.max(${textField.options.maxLength})`;
			}
			if (textField.options.pattern) {
				// Escape backslashes in pattern for string literal
				const escapedPattern = textField.options.pattern.replace(/\\/g, '\\\\');
				chain += `.regex(new RegExp(\`${escapedPattern}\`))`;
			}
			if (textField.options.variant === 'slug') {
				// Add refine for slug format validation
				chain += `.refine(val => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(val), { message: "Slug darf nur Kleinbuchstaben, Zahlen und Bindestriche enthalten und nicht mit Bindestrich beginnen/enden." })`;
			}
			return chain;

		case 'richtext':
			// Einfache Annahme: String (HTML)
			let rtChain = 'z.string()';
			const richTextField = field as RichTextField;
			if (richTextField.options.maxLength !== undefined) {
				// Hier könnte man eine Warnung ausgeben, da Zod dies nicht direkt unterstützt
				console.warn(`WARNUNG: maxLength für RichText-Feld "${field.apiId}" wird in Zod nicht direkt validiert.`);
			}
			return rtChain;

		case 'number':
			let numChain = 'z.number()';
			const numField = field as NumberField;
			if (numField.options.variant === 'integer') {
				numChain += `.int()`;
			}
			if (numField.options.min !== undefined) {
				numChain += `.min(${numField.options.min})`;
			}
			if (numField.options.max !== undefined) {
				numChain += `.max(${numField.options.max})`;
			}
			return numChain;

		case 'boolean':
			return 'z.boolean()';

		case 'date':
			// Generiert Code, der Date-Objekte erwartet.
			// Für APIs könnte z.coerce.date() besser sein.
			let dateChain = 'z.date()';
			// Verfeinerung für allowFuture/PastDates (optional, siehe vorheriges Beispiel)
			// Hier der Einfachheit halber weggelassen, da es den Code stark aufbläht
			return dateChain;

		case 'relation':
			const relField = field as RelationField;
			// Annahme: IDs sind strings oder numbers. Muss ggf. angepasst werden.
			const idTypeCode = 'z.union([z.string(), z.number()])';
			if (relField.options.relationType === 'one-to-many' || relField.options.relationType === 'many-to-many') {
				return `z.array(${idTypeCode})`;
			} else {
				return idTypeCode;
			}

		case 'media':
			// Annahme: Referenz-ID (string/number) oder null
			return `z.union([z.string(), z.number()]).nullable()`;

		case 'json':
			return 'z.any()'; // Oder z.record(z.string(), z.any()), etc.

		default:
			console.warn(`Unbekannter Feldtyp für Zod-Code-Generierung: ${(field as any).fieldType}`);
			return 'z.any()';
	}
}

// =============================================================================
// Hauptgenerator-Funktion
// =============================================================================

export interface ZodCodeGeneratorOptions {
	/** Liste der unterstützten Locale-Codes (z.B. ['en', 'de', 'fr']). */
	locales: string[];
	/** Der Code der Standard-Locale (z.B. 'en'). */
	defaultLocale: string;
}

/**
 * Generiert den TypeScript-Code-Inhalt für eine Zod-Schema-Datei.
 * @param definition - Die Definition des Content Types.
 * @param options - Konfiguration für die Code-Generierung (Locales).
 * @returns Ein String, der den Inhalt der .ts-Datei darstellt.
 */
export function generateZodSchemaFileContent(
	definition: ContentTypeDefinition,
	options: ZodCodeGeneratorOptions
): string {
	const { locales, defaultLocale } = options;
	const { apiId: typeApiId, timestamps, softDelete } = definition;

	// Namen für Schemas und Typen generieren (z.B. blogPost -> BlogPost)
	const baseName = _.upperFirst(_.camelCase(typeApiId));
	const createSchemaName = `${_.camelCase(typeApiId)}CreateSchema`;
	const updateSchemaName = `${_.camelCase(typeApiId)}UpdateSchema`;
	const outputSchemaName = `${_.camelCase(typeApiId)}OutputSchema`;
	const createInputTypeName = `${baseName}CreateInput`;
	const updateInputTypeName = `${baseName}UpdateInput`;
	const outputTypeName = `${baseName}Output`;

	const createShapeFields: string[] = [];
	const updateShapeFields: string[] = [];
	const outputShapeFields: string[] = [];


	// --- Felder verarbeiten ---
	for (const field of definition.fields) {
		if (field.fieldType === 'id') continue; // ID wird separat im Output behandelt

		let baseZodString = getBaseZodTypeString(field);
		let finalCreateString: string | null = null;
		let finalUpdateString: string | null = null;
		let finalOutputString: string | null = null;

		const isRequired = field.required;
		const hasDefault = field.defaultValue !== undefined; // Beinhaltet null nicht explizit
		const fieldApiId = field.fieldType === 'relation' ? `${field.apiId}Id` : field.apiId;

		// --- Lokalisierung ---
		if (field.localized && locales.length > 0) {
			const localeShapeFields: string[] = [];
			const baseLocaleTypeString = getBaseZodTypeString(field); // Typ ohne Optionalität

			for (const locale of locales) {
				let localeTypeString = baseLocaleTypeString;
				const isLocaleRequired = isRequired && locale === defaultLocale;
				if (!isLocaleRequired) {
					localeTypeString += '.optional()';
				}
				// Kein Default pro Locale hier angewendet
				localeShapeFields.push(`    ${locale}: ${localeTypeString}`);
			}
			const localizedObjectString = `z.object({\n${localeShapeFields.join(',\n')}\n  })`;

			// Output
			finalOutputString = localizedObjectString;
			if (!isRequired) {
				finalOutputString += '.optional()';
			}
			if (hasDefault && typeof field.defaultValue === 'object') {
				finalOutputString += `.default(${formatDefaultValueForCode(field.defaultValue)})`;
			}

			// Create
			if (field.creatable) {
				finalCreateString = localizedObjectString;
				if (!isRequired) {
					finalCreateString += '.optional()';
				}
				if (hasDefault && typeof field.defaultValue === 'object') {
					finalCreateString += `.default(${formatDefaultValueForCode(field.defaultValue)})`;
				}
			}
			// Update
			if (field.updatable) {
				// Optionalität kommt durch .partial() auf das Gesamtschema
				finalUpdateString = localizedObjectString;
			}

		} else {
			// --- Nicht lokalisierte Felder ---

			// Output
			finalOutputString = baseZodString;
			if (!isRequired) {
				finalOutputString += '.optional()';
			}
			if (hasDefault) {
				finalOutputString += `.default(${formatDefaultValueForCode(field.defaultValue)})`;
			}


			// Create
			if (field.creatable) {
				finalCreateString = baseZodString;
				if (!isRequired) {
					finalCreateString += '.optional()';
				}
				if (hasDefault) {
					finalCreateString += `.default(${formatDefaultValueForCode(field.defaultValue)})`;
				}
			}

			// Update
			if (field.updatable) {
				// Optionalität kommt durch .partial()
				finalUpdateString = baseZodString;
			}
		}

		// --- Shape-Strings befüllen ---
		if (finalCreateString) {
			createShapeFields.push(`  ${fieldApiId}: ${finalCreateString}`);
		}
		if (finalUpdateString) {
			updateShapeFields.push(`  ${fieldApiId}: ${finalUpdateString}`);
		}
		if (finalOutputString) {
			outputShapeFields.push(`  ${fieldApiId}: ${finalOutputString}`);
		}
	}

	// --- ID, Timestamps und SoftDelete zum Output hinzufügen ---
	const idField = definition.fields.find(f => f.fieldType === 'id') as IdField | undefined;
	if (idField) {
		outputShapeFields.unshift(`  ${idField.apiId}: ${getBaseZodTypeString(idField)}`); // ID zuerst
	}
	if (timestamps) {
		outputShapeFields.push(`  createdAt: z.date()`);
		outputShapeFields.push(`  updatedAt: z.date()`);
	}
	if (softDelete) {
		outputShapeFields.push(`  deletedAt: z.date().nullable()`);
	}

	// --- Gesamt-Code generieren ---
	const code = `
/**
 * GENERATED BY zodCodeGenerator.ts - DO NOT EDIT MANUALLY!
 *
 * Definitions for Content Type: ${definition.name} (${definition.apiId})
 */
import { z } from 'zod';

// --- Create Schema ---
export const ${createSchemaName} = z.object({
${createShapeFields.join(',\n')}
});
export type ${createInputTypeName} = z.infer<typeof ${createSchemaName}>;


// --- Update Schema ---
// Note: Wrapped in .partial() to allow partial updates.
export const ${updateSchemaName} = z.object({
${updateShapeFields.join(',\n')}
}).partial();
export type ${updateInputTypeName} = z.infer<typeof ${updateSchemaName}>;


// --- Output Schema ---
// Represents the full data structure including ID, timestamps, etc.
export const ${outputSchemaName} = z.object({
${outputShapeFields.join(',\n')}
});
export type ${outputTypeName} = z.infer<typeof ${outputSchemaName}>;

`;

	return code.trim() + '\n'; // Ensure trailing newline
}


// =============================================================================
// Beispielhafte Verwendung und Datei-Schreiben
// =============================================================================
/*
import * as fs from 'fs';
import * as path from 'path';
import { ContentTypeBuilder, FieldBuilder } from './definitionBuilder'; // Annahme: Builder existiert

const locales = ['en', 'de'];
const defaultLocale = 'en';

// Verwende die Definition aus dem Builder-Beispiel
const blogPostContentType = ContentTypeBuilder.create({
	apiId: 'blogPost',
	name: 'Blogbeitrag',
	description: 'Ein Artikel für den News-Bereich.',
	displayField: 'title',
	icon: 'pencil-alt',
	fields: [
		FieldBuilder.id({ options: { strategy: 'uuid' } }),
		FieldBuilder.text({ apiId: 'title', name: 'Titel' }, {
			localized: true, required: true, options: { maxLength: 120 },
			placeholder: ' Titel...', sortable: true, filterable: true, indexed: true
		}),
		FieldBuilder.slug({ apiId: 'slug', name: 'URL-Slug' }),
		FieldBuilder.richText({ apiId: 'content', name: 'Inhalt' }, {
			localized: true, required: true, options: { allowedBlocks: ['bold', 'italic', 'link', 'h2', 'bulletList'] }
		}),
		FieldBuilder.media({ apiId: 'featuredImage', name: 'Titelbild' }, {
			description: 'Bild.', required: false, options: { allowedMimeTypes: ['image/jpeg', 'image/png'], maxFileSizeKB: 4096 }
		}),
		FieldBuilder.boolean({ apiId: 'isPublished', name: 'Veröffentlicht' }, {
			options: { displayAs: 'switch' }, defaultValue: false, filterable: true, indexed: true
		}),
		FieldBuilder.date({ apiId: 'publishedAt', name: 'Veröffentlichungsdatum' }, {
			required: false, options: { variant: 'datetime' }, sortable: true
		}),
		FieldBuilder.relation({ apiId: 'author', name: 'Autor' }, {
			required: true, options: { relatedContentTypeApiId: 'user', relationType: 'many-to-one', displayWidget: 'dropdown', onDelete: 'SET NULL' }
		}),
		FieldBuilder.relation({ apiId: 'tags', name: 'Tags' }, {
			required: false, options: { relatedContentTypeApiId: 'tag', relationType: 'many-to-many', displayWidget: 'listbox' }
		}),
	]
});

// --- Code generieren ---
try {
	const generatedCode = generateZodSchemaFileContent(
		blogPostContentType,
		{ locales, defaultLocale }
	);

	console.log("--- Generierter Code für blogPost.ts ---");
	console.log(generatedCode);

	// --- In Datei schreiben (Beispiel) ---
	const outputDir = path.join(__dirname, 'generated', 'schemas');
	const outputPath = path.join(outputDir, `${_.camelCase(blogPostContentType.apiId)}.schema.ts`); // z.B. blogPost.schema.ts

	// Sicherstellen, dass das Verzeichnis existiert
	fs.mkdirSync(outputDir, { recursive: true });

	// Datei schreiben
	fs.writeFileSync(outputPath, generatedCode, 'utf-8');
	console.log(`\n✅ Zod-Schema-Datei geschrieben nach: ${outputPath}`);

} catch (error) {
	console.error("Fehler bei der Zod-Code-Generierung:", error);
}
*/