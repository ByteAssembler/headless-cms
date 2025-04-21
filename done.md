# Projektübersicht: Dynamisches Headless CMS

**Datum:** 21. April 2025

## 1. Projektziel

Wir wollen ein **Headless CMS in TypeScript** entwickeln, bei dem die **Struktur der Inhalte (Schema) direkt im Code definiert** wird. Das System soll eine **Entwicker-API** bieten und **durchgängige Typsicherheit** zwischen Backend und Frontend gewährleisten, idealerweise unter Nutzung von **Zod** für die Validierung. Als Datenbank-Layer wurde **Drizzle ORM** in Betracht gezogen, um die Kontrolle zu behalten und Typsicherheit zu gewährleisten. Die API-Schicht sollte ebenfalls typsicher sein und mit **tRPC** erfolgen.

**Was ist ein Headless CMS?**

Ein Headless CMS trennt die Inhaltsverwaltung (Backend) von der Inhaltsdarstellung (Frontend). Es stellt Inhalte über eine API bereit, sodass diese Inhalte auf verschiedenen Plattformen (Websites, mobile Apps, etc.) mit unterschiedlichen Technologien angezeigt werden können.

Wichtig dabei ist, dass das Schema selbst nur mit TypeScript definiert wird. Das bedeutet, dass die Struktur der Daten (z.B. Felder, Typen) nicht in einer Datenbankmigration oder in einem Admin-Interface festgelegt wird, sondern direkt im Code. Dies ermöglicht eine hohe Flexibilität und Anpassungsfähigkeit und vor allem Git-Versioning.

## 2. Technologie-Stack

* **Sprache:** **TypeScript** - Grundvoraussetzung für die gewünschte Typsicherheit.
* **Datenbank-ORM:** Drizzle ORM (TypeScript ORM, typsicher)
* **Datenbank:** SQLite (über LibSQL/Turso für lokale Entwicklung)
* **Validierung:** Zod (Schema-Deklaration und Validierung)
* **Sprache:** TypeScript
* **Build/Runtime:** tsx (für schnelle TypeScript-Ausführung in der Entwicklung)
* **Paketmanager:** pnpm

## 3. Kernkonzepte & Umsetzung

Die zentrale Idee ist, die Definition von Inhaltstypen von der Generierung des Datenbankschemas und der API-Logik zu entkoppeln.

### 3.1. Konfiguration der Inhaltstypen (`src/core/content-fields.ts`, `src/content-types.ts`)

* **`content-fields.ts`:**
  * Definiert eine Reihe von `define...Field`-Funktionen (z.B. `defineTextField`, `defineNumberField`, `defineRelationField`).
  * Jede Funktion nimmt Konfigurationsoptionen entgegen (z.B. `required`, `label`, `relationTo`, `many`) und gibt ein `FieldDefinition`-Objekt zurück.
  * Das `FieldDefinition`-Objekt enthält:
    * Den Feldnamen.
    * Ein **Zod-Schema** für die Validierung dieses Feldes.
    * Einen **Drizzle-Column-Builder** (oder `null` bei M2M-Relationen), der beschreibt, wie die entsprechende Datenbankspalte aussehen soll.
    * Ein `config`-Objekt mit den aufgelösten Optionen (inkl. Label, Relationendetails etc.).
* **`content-types.ts`:**
  * Importiert die `define...Field`-Funktionen.
  * Definiert die konkreten Inhaltstypen (z.B. `usersConfig`, `postsConfig`, `categoriesConfig`) als `ContentTypeConfig`-Objekte.
  * Jedes `ContentTypeConfig`-Objekt hat einen `apiIdentifier` (z.B. 'posts') und ein `fields`-Objekt, das die Felddefinitionen für diesen Typ enthält (erstellt mit den `define...Field`-Funktionen).
  * Exportiert eine Sammlung aller Konfigurationen (`allContentTypeConfigs`).

### 3.2. Dynamische Schema-Generierung (`src/db/schema.ts`)

Diese Datei ist das Herzstück der dynamischen Generierung. Sie läuft, wenn die Anwendung startet (oder wenn Drizzle Kit das Schema analysiert) und führt folgende Schritte aus:

* **Phase 1: Tabellen-Generierung:**
    1. Iteriert durch `allContentTypeConfigs`.
    2. Für jeden Content-Typ werden die Standardspalten (ID, Timestamps) und die Spalten aus den `FieldDefinition`-Objekten (wo `field.column` existiert) gesammelt.
    3. Für Felder, die Many-to-Many-Relationen definieren (`field.column` ist `null`, `many: true`), werden die beteiligten Tabellen für die spätere Join-Tabellen-Erstellung vorgemerkt.
    4. Mit `sqliteTable` von Drizzle wird das **Basis-Tabellenobjekt** (z.B. für `users`, `posts`) erstellt und in `allTables` gespeichert.
    5. Nachdem alle Basis-Tabellen erstellt sind, wird durch die vorgemerkten M2M-Relationen iteriert.
    6. Für jede M2M-Beziehung wird (falls noch nicht geschehen) eine **Join-Tabelle** (z.B. `categories_to_posts`) mit den entsprechenden Fremdschlüsselspalten (`categoryId`, `postId`) und `.references()`-Constraints erstellt und ebenfalls in `allTables` gespeichert.
* **Phase 2: Relations-Definition:**
    1. Die Funktion `defineAllDrizzleRelations` (aus `src/core/schema-relations.ts`) wird aufgerufen.
    2. Diese Funktion nimmt `allTables` und `allContentTypeConfigs` entgegen.
    3. Sie iteriert erneut durch die Konfigurationen und die Felder.
    4. Basierend auf den `relationTo`- und `many`-Optionen in den `RelationFieldDefinition`-Konfigurationen generiert sie die Drizzle `relations`-Objekte für jede Tabelle (inklusive der Join-Tabellen). Sie verwendet dabei Konventionen für Fremdschlüsselnamen (`authorId`) und Join-Tabellennamen (`categories_to_posts`).
    5. Die generierten `relations`-Objekte werden zurückgegeben.
* **Exports:**
    1. Alle generierten Tabellen (`allTables`) und Relationen (`allGeneratedRelations`) werden exportiert.
    2. Zusätzlich werden die einzelnen Tabellen und Relationen **explizit** exportiert (z.B. `export const users = ...`, `export const postsRelations = ...`). Dies ist entscheidend für die Typsicherheit und damit Drizzle's `db.query`-Interface korrekt funktioniert.
    3. Ein kombiniertes `schema`-Objekt, das alle explizit exportierten Tabellen und Relationen enthält, wird für die Übergabe an den Drizzle-Client (`drizzle(client, { schema })`) exportiert.

### 3.3. Relations-Logik (`src/core/schema-relations.ts`)

* Enthält die Funktion `defineAllDrizzleRelations`.
* Diese Funktion kapselt die Logik zur Übersetzung der Feldkonfigurationen (insbesondere `RelationFieldDefinition`) in Drizzle's `relations`-Syntax.
* Sie unterscheidet zwischen `many: false` (Many-to-One, erzeugt `relations.one(...)` mit Verweis auf die FK-Spalte) und `many: true` (One-to-Many oder Many-to-Many).
* Für Many-to-Many identifiziert sie die Join-Tabelle anhand der Namenskonvention und erstellt die `relations.many(...)`-Verknüpfung zur Join-Tabelle.
* Sie generiert auch die umgekehrten `relations.one(...)`-Definitionen für die Join-Tabellen selbst, die auf die Haupttabellen verweisen.

## 4. Aktueller Status (21. April 2025)

* Die Definition von Content-Typen über Konfigurationsdateien (`src/content-types.ts`) ist implementiert.
* Die dynamische Generierung des Drizzle-Schemas (Tabellen inkl. Join-Tabellen und Relationen) in `src/db/schema.ts` funktioniert.
* Die `tsconfig.json` ist so konfiguriert, dass sie mit dem Modulsystem und den Importen zurechtkommt.
* Drizzle Kit (`npm run db:kit generate` und `npm run db:kit push`) kann das generierte Schema lesen und entsprechende Datenbankmigrationen erstellen und anwenden.
* Der Hono-Server (`src/index.ts`) startet erfolgreich und ist über den Drizzle-Client (`db`) mit der SQLite-Datenbank verbunden, wobei das dynamisch generierte Schema für typsichere Abfragen (`db.query...`) verwendet wird.
* Eine Beispiel-Route (`/`) führt erfolgreich eine Datenbankabfrage auf die `users`-Tabelle durch.

## 5. Nächste Schritte

1. **API-Routen für CRUD-Operationen:** Implementierung von Endpunkten (z.B. unter `/api/posts`, `/api/users`) für das Auflisten, Anzeigen, Erstellen, Aktualisieren und Löschen von Inhalten mithilfe von Hono und dem Drizzle-Client (`db`).
2. **Input-Validierung:** Nutzung der generierten Zod-Schemas in den API-Routen, um eingehende Daten bei `POST`- und `PUT`/`PATCH`-Anfragen zu validieren.
3. **API-Relationen:** Handhabung von Relationen in den API-Endpunkten (Setzen von Fremdschlüsseln/Join-Tabellen-Einträgen beim Schreiben, Laden von verknüpften Daten mit `with` beim Lesen).
4. **(Optional) Authentifizierung/Autorisierung:** Absicherung der API-Endpunkte.
5. **(Optional) Admin-Interface:** Entwicklung eines Frontends zur Verwaltung der Inhalte über die erstellte API.
