/**
 * types.ts
 *
 * Definiert die Kern-TypeScript-Typen für das Content-Management-System (CMS).
 * Diese Datei dient als "Single Source of Truth" für die Struktur von Content Types
 * und deren Feldern. Sie wird von Helper-Funktionen zur einfacheren Definition
 * und von Generatoren zur Erstellung von Datenbank-Schemas (Drizzle),
 * Validierungs-Schemas (Zod) und API-Routen (tRPC) verwendet.
 */

// =============================================================================
// Hilfstypen / Enums
// =============================================================================

/**
 * Die grundlegenden Typen, die ein Feld im CMS haben kann.
 */
export type FieldType =
	| 'id'          // Spezieller Typ für Primärschlüssel
	| 'text'        // Für kurze oder lange Texteingaben
	| 'number'      // Für Ganzzahlen oder Fließkommazahlen
	| 'boolean'     // Für Wahr/Falsch-Werte
	| 'date'        // Für Datum oder Datum+Zeit-Werte
	| 'relation'    // Für Verknüpfungen zu anderen Content Types
	| 'media'       // Für Verweise auf hochgeladene Dateien (Bilder, PDFs etc.)
	| 'json'        // Für die Speicherung von beliebigen JSON-Strukturen
	| 'richtext';   // Für formatierten Text über einen WYSIWYG-Editor

/**
 * Optionen für Aktionen, die bei Fremdschlüsselbeziehungen auf Datenbankebene
 * definiert werden können (relevant für `RelationField`).
 */
export type ForeignKeyAction =
	| 'CASCADE'     // Löscht/Aktualisiert abhängige Zeile automatisch.
	| 'RESTRICT'    // Verhindert Lösch-/Update-Operation, wenn abhängige Zeilen existieren.
	| 'SET NULL'    // Setzt den Fremdschlüssel in der abhängigen Zeile auf NULL.
	| 'SET DEFAULT' // Setzt den Fremdschlüssel auf seinen Default-Wert (selten sinnvoll).
	| 'NO ACTION';  // Ähnlich wie RESTRICT, Prüfung erfolgt ggf. später (DB-abhängig).

// =============================================================================
// Basis-Interface für alle Felddefinitionen
// =============================================================================

/**
 * Enthält alle gemeinsamen Eigenschaften, die *jedes* Feld unabhängig
 * von seinem spezifischen Typ (`fieldType`) besitzt.
 */
export interface BaseField {
	/** Technischer Bezeichner (Slug), muss eindeutig innerhalb des Content Types sein. Wird für API und DB-Spaltennamen verwendet. */
	apiId: string;

	/** Anzeigename des Feldes im CMS-Interface für Redakteure. */
	name: string;

	/** Optionale Beschreibung oder Hilfetext, der im CMS-Interface angezeigt wird. */
	description?: string;

	/** Optionaler Platzhaltertext für Eingabefelder im CMS. */
	placeholder?: string;

	/** Muss dieses Feld zwingend ausgefüllt werden? (Default: true, außer bei ID). Beeinflusst DB-Schema (`NOT NULL`) und Validierung. */
	required: boolean;

	/** Muss der Wert dieses Feldes über alle Einträge dieses Content Types hinweg eindeutig sein? (Default: false, außer bei ID). Beeinflusst DB-Schema (`UNIQUE`). */
	unique: boolean;

	/** Ist der Inhalt dieses Feldes übersetzbar? (Default: false). Beeinflusst Speicherung (z.B. JSON-Objekt) und API-Struktur. */
	localized: boolean;

	// --- UI/Lifecycle Kontrolle ---

	/** Soll das Feld im Eingabeformular des CMS versteckt werden? (Default: false). Nützlich für rein systemverwaltete Felder. */
	hidden: boolean;

	/** Soll das Feld standardmäßig in Listen-/Tabellenansichten im CMS angezeigt werden? (Default: true). `hidden: true` impliziert `showInListView: false`. */
	showInListView: boolean;

	/** Kann dieses Feld beim *Erstellen* eines neuen Eintrags gesetzt werden? (Default: true, außer ID). Wenn false, muss ein Default-Wert existieren oder es wird programmatisch gesetzt. */
	creatable: boolean;

	/** Kann dieses Feld *nach* dem erstmaligen Erstellen eines Eintrags noch geändert werden? (Default: true, außer ID und oft Slug). */
	updatable: boolean;

	// --- API/DB Hinweise ---

	/** Darf über dieses Feld in API-Anfragen gefiltert werden? (Default: false). Hinweis für tRPC/API-Generator. */
	filterable: boolean;

	/** Darf nach diesem Feld in API-Anfragen sortiert werden? (Default: false). Hinweis für tRPC/API-Generator. */
	sortable: boolean;

	/** Soll für dieses Feld ein Datenbank-Index erstellt werden? (Default: false, außer bei ID und `unique:true`). Hinweis für Drizzle-Generator zur Performance-Optimierung. */
	indexed: boolean;

	/** Standardwert für das Feld. Muss zum `fieldType` passen. Wird für DB-Default und/oder Zod-Default verwendet. Die Typisierung hier ist 'any', da sie stark vom `fieldType` abhängt. Spezifische Interfaces können dies überschreiben. */
	defaultValue?: any;
}

// =============================================================================
// Spezifische Interfaces für jeden Feldtyp (Discriminated Union)
// =============================================================================

// --- ID Field ---
/** Definiert den Primärschlüssel eines Content Types. */
export interface IdField extends Omit<BaseField, 'apiId' | 'name' | 'required' | 'unique' | 'localized' | 'creatable' | 'updatable' | 'filterable' | 'sortable' | 'indexed' | 'hidden' | 'showInListView' | 'defaultValue'> {
	fieldType: 'id';
	// Überschreibt/Fixiert Eigenschaften von BaseField für IDs:
	apiId: 'id'; // Konvention: Primärschlüssel heißt immer 'id'
	name: 'ID'; // Standardanzeigename
	required: true;
	unique: true;
	localized: false;
	creatable: false; // Wird vom System/DB generiert
	updatable: false; // Primärschlüssel sind nicht änderbar
	filterable: true; // Nach ID kann immer gefiltert werden
	sortable: true;  // Nach ID kann immer sortiert werden
	indexed: true; // Ist immer indiziert (Primary Key)
	hidden: true; // Oft im Formular versteckt
	showInListView: false; // Selten in Listenansicht relevant
	defaultValue?: undefined; // Kein Default für generierte IDs
	options: {
		/** Strategie zur Generierung der ID (beeinflusst DB-Typ). */
		strategy: 'uuid' | 'autoincrement' | 'cuid';
	};
}

// --- Text Field ---
/** Definiert ein Textfeld. */
export interface TextField extends BaseField {
	fieldType: 'text';
	options: {
		/** Variante des Textfeldes (beeinflusst UI und ggf. DB-Typ/Länge). */
		variant: 'short' | 'long' | 'slug';
		/** Minimale erforderliche Länge. */
		minLength?: number;
		/** Maximale erlaubte Länge (kann DB `VARCHAR` Länge beeinflussen). */
		maxLength?: number;
		/** Regex-Muster (als String) zur Validierung des Inhalts. */
		pattern?: string;
	};
	/** Standardwert für das Textfeld. */
	defaultValue?: string;
}

// --- RichText Field ---
/** Definiert ein Feld für formatierten Text (WYSIWYG). */
export interface RichTextField extends BaseField {
	fieldType: 'richtext';
	options: {
		/** Welche Formatierungsblöcke sind im Editor erlaubt? */
		allowedBlocks?: ('bold' | 'italic' | 'underline' | 'link' | 'h1' | 'h2' | 'h3' | 'bulletList' | 'orderedList' | 'blockquote' | 'codeBlock')[];
		/** Maximale Zeichenlänge (approximativ, je nach Editor-Implementierung). */
		maxLength?: number;
	};
	/** Standardwert (oft HTML-String oder JSON-Objekt, je nach Editor). */
	defaultValue?: string | object;
}

// --- Number Field ---
/** Definiert ein Zahlenfeld. */
export interface NumberField extends BaseField {
	fieldType: 'number';
	options: {
		/** Variante der Zahl (beeinflusst DB-Typ und Validierung). */
		variant: 'integer' | 'float';
		/** Minimal erlaubter Wert. */
		min?: number;
		/** Maximal erlaubter Wert. */
		max?: number;
	};
	/** Standardwert für das Zahlenfeld. */
	defaultValue?: number;
}

// --- Boolean Field ---
/** Definiert ein Wahr/Falsch-Feld. */
export interface BooleanField extends BaseField {
	fieldType: 'boolean';
	options: {
		/** Wie soll das Feld im CMS dargestellt werden? */
		displayAs: 'switch' | 'checkbox';
	};
	/** Standardwert für das Boolean-Feld. */
	defaultValue?: boolean;
}

// --- Date Field ---
/** Definiert ein Datums- oder Zeitstempelfeld. */
export interface DateField extends BaseField {
	fieldType: 'date';
	options: {
		/** Variante des Datumsfeldes (beeinflusst UI und DB-Typ). */
		variant: 'dateonly' | 'datetime';
		/** Sind Datumswerte in der Zukunft erlaubt? */
		allowFutureDates?: boolean; // Default: true
		/** Sind Datumswerte in der Vergangenheit erlaubt? */
		allowPastDates?: boolean; // Default: true
	}
	/** Standardwert (ISO-String, spezieller String wie 'now' oder Date-Objekt - Konvertierung nötig!). */
	defaultValue?: string | Date | 'now';
}

// --- Relation Field ---
/** Definiert eine Verknüpfung zu Einträgen eines anderen Content Types. */
export interface RelationField extends BaseField {
	fieldType: 'relation';
	options: {
		/** `apiId` des Content Types, zu dem die Beziehung besteht. */
		relatedContentTypeApiId: string;
		/** Art der Beziehung (beeinflusst DB-Struktur und API). */
		relationType: 'one-to-one' | 'one-to-many' | 'many-to-one' | 'many-to-many';
		/** Welches UI-Widget soll zur Auswahl der verknüpften Einträge verwendet werden? */
		displayWidget?: 'dropdown' | 'autocomplete' | 'listbox' | 'modal';
		/** Aktion, die auf DB-Ebene ausgeführt wird, wenn der *verknüpfte* Eintrag gelöscht wird. */
		onDelete?: ForeignKeyAction; // Default: 'NO ACTION' / 'RESTRICT'
		/** Aktion, die auf DB-Ebene ausgeführt wird, wenn der Primärschlüssel des *verknüpften* Eintrags geändert wird (selten relevant bei unveränderlichen IDs). */
		onUpdate?: ForeignKeyAction; // Default: 'NO ACTION' / 'RESTRICT'
	};
	/** Standardwert ist meist nicht sinnvoll, außer vielleicht eine Standard-ID (als string/number). */
	defaultValue?: string | number | (string | number)[]; // ID oder Array von IDs
}

// --- Media Field ---
/** Definiert ein Feld für Mediendateien (Bilder, Dokumente etc.). Speichert typischerweise eine Referenz (z.B. ID oder URL) zur Datei. */
export interface MediaField extends BaseField {
	fieldType: 'media';
	options: {
		/** Erlaubte MIME-Types (z.B. ['image/jpeg', 'image/png', 'application/pdf']). */
		allowedMimeTypes?: string[];
		/** Maximale Dateigröße in Kilobytes (KB). */
		maxFileSizeKB?: number;
		// Zukünftig: Bildgrößen-Vorgaben, Alt-Text-Pflicht etc.
	};
	/** Standardwert selten sinnvoll, evtl. Referenz zu einem Default-Asset. */
	defaultValue?: null | string | number; // Referenz-ID
}

// --- JSON Field ---
/** Definiert ein Feld zur Speicherung beliebiger JSON-Daten. */
export interface JsonField extends BaseField {
	fieldType: 'json';
	options: {
		/** Optional: Ein JSON-Schema zur Validierung der Struktur des JSON-Objekts. */
		schema?: object;
	}
	/** Standardwert als JavaScript-Objekt oder Array. */
	defaultValue?: object | any[];
}

// =============================================================================
// Union Type für alle Felddefinitionen
// =============================================================================

/**
 * Repräsentiert *jede* mögliche Art von Felddefinition in einem Content Type.
 * Wird im `fields`-Array der `ContentTypeDefinition` verwendet.
 */
export type FieldDefinition =
	| IdField
	| TextField
	| RichTextField
	| NumberField
	| BooleanField
	| DateField
	| RelationField
	| MediaField
	| JsonField;

// =============================================================================
// Definition eines Content Types
// =============================================================================

/**
 * Definiert die gesamte Struktur und das Verhalten eines Content Types im CMS.
 */
export interface ContentTypeDefinition {
	/** Technischer Bezeichner (Slug), systemweit eindeutig. Wird für API-Routen und DB-Tabellennamen verwendet. */
	apiId: string;

	/** Anzeigename des Content Types im CMS-Interface. */
	name: string;

	/** Optionale Beschreibung des Zwecks dieses Content Types. */
	description?: string;

	/** `apiId` des Feldes, dessen Wert als Titel/Label für Einträge dieses Typs in Listenansichten verwendet werden soll. */
	displayField: string; // Muss auf ein Feld in `fields` verweisen (oft ein 'text'-Feld)

	/** Optionaler Name oder SVG-String eines Icons für die Darstellung im CMS-Menü. */
	icon?: "IconName" | string; // SVG-String oder Icon-Name (z.B. 'fa-solid fa-file')

	// --- Verhalten auf Typ-Ebene ---

	/** Sollen `createdAt` und `updatedAt` Zeitstempel automatisch für Einträge dieses Typs verwaltet werden? (Default: true). Beeinflusst DB-Schema und API-Logik. */
	timestamps: boolean;

	/** Soll für Einträge dieses Typs Soft Deletion verwendet werden (d.h. Einträge werden nur als gelöscht markiert statt physisch entfernt)? (Default: false). Beeinflusst DB-Schema (z.B. `deletedAt`-Spalte) und API-Queries. */
	softDelete: boolean;

	/** Array der Felddefinitionen, die die Struktur der Daten für diesen Content Type beschreiben. */
	fields: FieldDefinition[];

	// Zukünftig evtl.:
	// layout?: { tabs?: { name: string, fields: string[] }[] }; // Für UI-Layouting
}