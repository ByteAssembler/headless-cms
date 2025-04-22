/**
 * trpcRouterCodeGenerator.ts
 *
 * Generiert TypeScript-Code (als String) für eine Datei, die einen tRPC Router
 * mit CRUD-Operationen definiert, basierend auf einer ContentTypeDefinition.
 * Verwendet generierte Zod- und Drizzle-Schema-Dateien.
 */

// Importiere Typen explizit mit `type`
import type {
  ContentTypeDefinition,
  FieldDefinition,
  IdField,
  RelationField,
} from '../fields/types'; // ANPASSEN
import _ from 'lodash';

// =============================================================================
// Hilfsfunktionen
// =============================================================================

function toSnakeCase(str: string): string { return _.snakeCase(str); }
function toCamelCase(str: string): string { return _.camelCase(str); }
function toPascalCase(str: string): string { return _.upperFirst(_.camelCase(str)); }

function getIdZodTypeString(definition: ContentTypeDefinition): string {
  const idField = definition.fields.find(f => f.fieldType === 'id') as IdField | undefined;
  if (!idField) throw new Error(`Content type ${definition.apiId} hat kein ID-Feld.`);
  return idField.options.strategy === 'autoincrement' ? `z.number().int().positive()` : `z.string()`;
}

function getIdColumnName(drizzleTableName: string): string { return `${drizzleTableName}.id`; }
function getDeletedAtColumnName(drizzleTableName: string): string { return `${drizzleTableName}.deletedAt`; }
function getUpdatedAtColumnName(drizzleTableName: string): string { return `${drizzleTableName}.updatedAt`; }


// =============================================================================
// Hauptgenerator-Funktion
// =============================================================================

export interface TrpcCodeGeneratorOptions {
  trpcSetupPath: string;
  zodSchemaDir: string;
  drizzleSchemaDir: string;
  contextTypeName: string;
}

export function generateTrpcRouterFileContent(
  definition: ContentTypeDefinition,
  options: TrpcCodeGeneratorOptions
): string {
  const { apiId: typeApiId, timestamps, softDelete } = definition;
  const { trpcSetupPath, zodSchemaDir, drizzleSchemaDir, contextTypeName } = options;

  // --- Namen generieren ---
  const routerName = `${toCamelCase(typeApiId)}Router`;
  const baseName = toPascalCase(typeApiId);
  const zodSchemaModuleName = `${toCamelCase(typeApiId)}.schema`;
  const zodCreateSchemaName = `${toCamelCase(typeApiId)}CreateSchema`;
  const zodUpdateSchemaName = `${toCamelCase(typeApiId)}UpdateSchema`;
  const zodOutputSchemaName = `${toCamelCase(typeApiId)}OutputSchema`;
  const tsCreateInputTypeName = `${baseName}CreateInput`;
  const tsUpdateInputTypeName = `${baseName}UpdateInput`;
  const tsOutputTypeName = `${baseName}Output`;

  const drizzleSchemaModuleName = `${toSnakeCase(typeApiId)}.schema`;
  const drizzleTableName = toSnakeCase(typeApiId);
  // WICHTIG: Konvention für Drizzle-Objekt-Namen anpassen, wenn nötig.
  // Wenn Drizzle z.B. 'userTable' generiert, hier anpassen.
  // Wir verwenden hier den Tabellennamen in snake_case, wie er im Import steht.
  const drizzleTableObjectName = drizzleTableName;

  const idZodTypeString = getIdZodTypeString(definition);
  const idColumnName = getIdColumnName(drizzleTableObjectName);
  const deletedAtColumnName = getDeletedAtColumnName(drizzleTableObjectName);
  const updatedAtColumnName = getUpdatedAtColumnName(drizzleTableObjectName);

  // --- Code-Blöcke vorbereiten ---
  const imports: string[] = [
    `import { z } from 'zod';`,
    `import { TRPCError } from '@trpc/server';`,
    `import { eq, and, isNull, asc, desc } from 'drizzle-orm';`,
    // KORREKTUR: Importiere Context NICHT als Typ, wenn er in Laufzeit-Signaturen gebraucht wird
    //            ODER übergebe den Typnamen als String und verwende ihn so. Hier Option 2:
    `import { t, publicProcedure, protectedProcedure } from '${trpcSetupPath}';`,
    `import type { ${contextTypeName} } from '${trpcSetupPath}';`, // Nur als Typ importieren
    `import {`,
    `  ${zodCreateSchemaName},`,
    `  ${zodUpdateSchemaName},`,
    `  ${zodOutputSchemaName},`,
    `  type ${tsCreateInputTypeName},`, // Typen mit 'type' importieren
    `  type ${tsUpdateInputTypeName},`,
    `  type ${tsOutputTypeName},`,
    `} from '${zodSchemaDir}/${zodSchemaModuleName}';`,
    // KORREKTUR: Drizzle Import - benutze den snake_case Namen als Konvention
    `import { ${drizzleTableName} } from '${drizzleSchemaDir}/${drizzleSchemaModuleName}';`,
  ];

  // --- Input Schemas für Prozeduren definieren (für bessere Typisierung und Lesbarkeit) ---
  const findManyInputSchemaString = `z.object({
        limit: z.number().int().min(1).max(100).optional().default(20),
        offset: z.number().int().min(0).optional().default(0),
        // TODO: Add sorting/filtering schemas here based on 'sortable'/'filterable' fields
      }).optional().default({})`;
  const findOneInputSchemaString = `z.object({ id: ${idZodTypeString} })`;
  const updateInputSchemaString = `z.object({ id: ${idZodTypeString}, data: ${zodUpdateSchemaName} })`;
  // KORREKTUR: Rename 'delete' procedure input schema
  const deleteByIdInputSchemaString = `z.object({ id: ${idZodTypeString} })`;


  // --- Router-Definition ---
  let routerCode = `
/**
 * GENERATED BY trpcCodeGenerator.ts - DO NOT EDIT MANUALLY!
 *
 * tRPC Router for Content Type: ${definition.name} (${definition.apiId})
 */
${imports.join('\n')}

// Konvention: 'protProc' für geschützte, 'pubProc' für öffentliche Prozeduren
const protProc = protectedProcedure;
const pubProc = publicProcedure;

// Definiere Input-Typen für die Prozeduren
const findManyInputSchema = ${findManyInputSchemaString};
const findOneInputSchema = ${findOneInputSchemaString};
const updateInputSchema = ${updateInputSchemaString};
const deleteByIdInputSchema = ${deleteByIdInputSchemaString}; // Renamed

export const ${routerName} = t.router({
`;

  // --- FindMany Procedure ---
  // KORREKTUR: Syntax der Signatur und Verwendung von ctx/input
  routerCode += `
  /**
   * FIND MANY - Holt eine Liste von Einträgen.
   */
  findMany: pubProc
    .input(${findManyInputSchemaString}) // Verwende direkt den String
    .output(z.array(${zodOutputSchemaName}))
    .query(async (opts: { ctx: ${contextTypeName}; input: z.infer<typeof findManyInputSchema> }) => {
      const { ctx, input } = opts; // Destrukturierung innerhalb der Funktion
      try {
        const softDeleteClause = ${softDelete ? `isNull(${deletedAtColumnName})` : 'undefined'};
        const results = await ctx.db
          .select()
          .from(${drizzleTableObjectName})
          .where(softDeleteClause)
          .limit(input.limit)
          .offset(input.offset);
        return results as ${tsOutputTypeName}[];
      } catch (error) {
        console.error('[tRPC ${typeApiId}.findMany] Error:', error);
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      }
    }),
`;

  // --- FindOne Procedure ---
  // KORREKTUR: Syntax der Signatur
  routerCode += `
  /**
   * FIND ONE - Holt einen einzelnen Eintrag anhand seiner ID.
   */
  findOne: pubProc
    .input(${findOneInputSchemaString}) // Verwende direkt den String
    .output(${zodOutputSchemaName}.nullable())
    .query(async (opts: { ctx: ${contextTypeName}; input: z.infer<typeof findOneInputSchema> }) => {
      const { ctx, input } = opts; // Destrukturierung
      try {
        const softDeleteClause = ${softDelete ? `isNull(${deletedAtColumnName})` : 'undefined'};
        const result = await ctx.db
          .select()
          .from(${drizzleTableObjectName})
          .where(
            and(
              eq(${idColumnName}, input.id),
              softDeleteClause
            )
          )
          .limit(1);
        if (result.length === 0) return null;
        return result[0] as ${tsOutputTypeName};
      } catch (error) {
        console.error('[tRPC ${typeApiId}.findOne] Error:', error);
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      }
    }),
`;

  // --- Create Procedure ---
  // KORREKTUR: Methodenname und Signatur
  routerCode += `
  /**
   * CREATE - Erstellt einen neuen Eintrag.
   */
  create: protProc
    .input(${zodCreateSchemaName})
    .output(${zodOutputSchemaName})
    .mutation(async (opts: { ctx: ${contextTypeName}; input: ${tsCreateInputTypeName} }) => {
      const { ctx, input } = opts; // Destrukturierung
      try {
        const created = await ctx.db
          .insert(${drizzleTableObjectName})
          .values(input)
          .returning();
        if (created.length === 0) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
        return created[0] as ${tsOutputTypeName};
      } catch (error: any) {
        console.error('[tRPC ${typeApiId}.create] Error:', error);
        if (error.code === '23505') throw new TRPCError({ code: 'CONFLICT' });
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      }
    }),
`;

  // --- Update Procedure ---
  // KORREKTUR: Methodenname und Signatur
  routerCode += `
  /**
   * UPDATE - Aktualisiert einen bestehenden Eintrag.
   */
  update: protProc
    .input(${updateInputSchemaString}) // Verwende direkt den String
    .output(${zodOutputSchemaName})
    .mutation(async (opts: { ctx: ${contextTypeName}; input: z.infer<typeof updateInputSchema> }) => {
      const { ctx, input } = opts; // Destrukturierung
      const dataToUpdate = input.data as Record<string, any>;

      ${timestamps ? `dataToUpdate.updatedAt = new Date();` : ''}

      try {
        const softDeleteClause = ${softDelete ? `isNull(${deletedAtColumnName})` : 'undefined'};
        const updated = await ctx.db
          .update(${drizzleTableObjectName})
          .set(dataToUpdate)
          .where(
            and(
              eq(${idColumnName}, input.id),
              softDeleteClause
            )
          )
          .returning();
        if (updated.length === 0) {
            const exists = await ctx.db.select({ id: ${idColumnName} }).from(${drizzleTableObjectName}).where(eq(${idColumnName}, input.id)).limit(1);
            if (exists.length === 0) throw new TRPCError({ code: 'NOT_FOUND' });
            else throw new TRPCError({ code: 'PRECONDITION_FAILED' });
        }
        return updated[0] as ${tsOutputTypeName};
      } catch (error: any) {
        console.error('[tRPC ${typeApiId}.update] Error:', error);
        if (error.code === '23505') throw new TRPCError({ code: 'CONFLICT' });
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      }
    }),
`;

  // --- Delete Procedure ---
  // KORREKTUR: Methodenname (deleteById) und Signatur
  routerCode += `
  /**
   * DELETE - Löscht einen Eintrag (oder führt Soft Delete durch).
   */
  deleteById: protProc // Renamed from 'delete'
    .input(${deleteByIdInputSchemaString}) // Verwende direkt den String
    .output(z.object({ id: ${idZodTypeString} }))
    .mutation(async (opts: { ctx: ${contextTypeName}; input: z.infer<typeof deleteByIdInputSchema> }) => {
      const { ctx, input } = opts; // Destrukturierung
      try {
        let deletedId: ${tsOutputTypeName}['id'] | undefined = undefined;

        ${softDelete ? `
        // --- Soft Delete ---
        const dataToSet: Record<string, any> = { deletedAt: new Date() };
        ${timestamps ? `dataToSet.updatedAt = new Date();` : ''}
        const result = await ctx.db
          .update(${drizzleTableObjectName})
          .set(dataToSet)
          .where(
            and(
              eq(${idColumnName}, input.id),
              isNull(${deletedAtColumnName})
            )
          )
          .returning({ id: ${idColumnName} });
        if (result.length > 0) deletedId = result[0].id;
        ` : `
        // --- Hard Delete ---
        const result = await ctx.db
          .delete(${drizzleTableObjectName})
          .where(eq(${idColumnName}, input.id))
          .returning({ id: ${idColumnName} });
        if (result.length > 0) deletedId = result[0].id;
        `
    }

        if (deletedId === undefined) {
          const exists = await ctx.db.select({ id: ${idColumnName} }).from(${drizzleTableObjectName}).where(eq(${idColumnName}, input.id)).limit(1);
          if (exists.length === 0) throw new TRPCError({ code: 'NOT_FOUND' });
          else throw new TRPCError({ code: 'PRECONDITION_FAILED' });
        }
        return { id: deletedId };
      } catch (error: any) {
        console.error('[tRPC ${typeApiId}.deleteById] Error:', error); // Log angepasst
        if (error.code === '23503') throw new TRPCError({ code: 'CONFLICT' });
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      }
    }),
`;

  // --- Router abschließen ---
  // KORREKTUR: Schließende Klammer für t.router({...})
  routerCode += `
}); // End of ${routerName} definition
`;

  return routerCode.trim() + '\n';
}