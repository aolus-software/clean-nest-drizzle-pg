import { DatatableType, PaginationResponse, SortDirection } from "@common";
import { db, DbTransaction } from "@repositories";
import { and, asc, inArray, desc, eq, ilike, or, SQL } from "drizzle-orm";
import { permissions_table } from "../schema/rbac.schema";
import { defaultSort } from "@utils";
import { BadRequestException } from "@nestjs/common";
import { I18nContext } from "nestjs-i18n";

export interface PermissionList {
	id: string;
	name: string;
	group: string;
	created_at: Date;
	updated_at: Date;
}

/* Sortable columns, keyed by the name the API accepts in ?sort=. Keys are
   camelCase so the wire contract matches the sibling Prisma template and the
   shared defaultSort constant; values are the snake_case Drizzle columns they
   map onto. */
const permissionOrderableColumns = {
	id: permissions_table.id,
	name: permissions_table.name,
	group: permissions_table.group,
	createdAt: permissions_table.created_at,
	updatedAt: permissions_table.updated_at,
};

/* The ?sort= and filter[...] values this repository accepts. Exported so the
   controller can document them in Swagger from one source of truth rather than
   restating the list. An unrecognised value is rejected, not ignored. */
export const permissionSortableFields = Object.keys(permissionOrderableColumns);
export const permissionFilterableFields = ["name", "group"];

export const PermissionRepository = () => {
	const dbInstance = db;

	return {
		db: dbInstance,
		getDb: (tx?: DbTransaction) => {
			const database = tx || dbInstance;
			return database;
		},

		findAll: async (
			queryParam: DatatableType,
			tx?: DbTransaction,
		): Promise<PaginationResponse<PermissionList>> => {
			const database = tx || dbInstance;

			const page: number = queryParam.page || 1;
			const limit: number = queryParam.limit || 10;
			const search: string | null = queryParam.search || null;
			const orderBy: string = queryParam.sort ? queryParam.sort : defaultSort;
			const orderDirection: SortDirection = queryParam.sortDirection
				? queryParam.sortDirection
				: "desc";
			const filter: Record<string, boolean | string | Date> | null =
				queryParam.filter || null;
			const offset = (page - 1) * limit;

			let whereCondition: SQL | undefined;
			if (search) {
				whereCondition = and(
					whereCondition,
					or(
						ilike(permissions_table.name, `%${search}%`),
						ilike(permissions_table.group, `%${search}%`),
					),
				);
			}

			if (filter) {
				for (const key of Object.keys(filter)) {
					if (!permissionFilterableFields.includes(key)) {
						throw new BadRequestException(
							I18nContext.current()?.t("message.common.invalid_filter_field") ??
								"Invalid filter field",
						);
					}
				}
			}

			let filterConditions: SQL | undefined;
			if (filter) {
				if (filter.group) {
					filterConditions = and(
						filterConditions,
						eq(permissions_table.group, filter.group as string),
					);
				}

				if (filter.name) {
					filterConditions = and(
						filterConditions,
						eq(permissions_table.name, filter.name as string),
					);
				}
			}

			const finalWhereCondition: SQL | undefined = and(
				whereCondition,
				filterConditions,
			);

			type OrderableKey = keyof typeof permissionOrderableColumns;
			const orderableKeys = permissionSortableFields as OrderableKey[];

			if (!orderableKeys.includes(orderBy as OrderableKey)) {
				throw new BadRequestException(
					I18nContext.current()?.t("message.common.invalid_sort_field") ??
						"Invalid sort field",
				);
			}

			if (!(["asc", "desc"] as const).includes(orderDirection)) {
				throw new BadRequestException(
					I18nContext.current()?.t("message.common.invalid_sort_direction") ??
						"Invalid sort direction",
				);
			}

			const orderColumn = permissionOrderableColumns[orderBy as OrderableKey];

			const [data, total] = await Promise.all([
				database.query.permissions.findMany({
					where: finalWhereCondition,
					orderBy:
						orderDirection === "asc" ? asc(orderColumn) : desc(orderColumn),
					limit: limit,
					offset: offset,
				}),
				database.$count(permissions_table, finalWhereCondition),
			]);

			return {
				data: data,
				meta: {
					page: page,
					limit: limit,
					totalCount: total,
					totalPages: Math.ceil(total / limit),
				},
			};
		},

		create: async (
			permissionData: { actions: string[]; group: string },
			tx?: DbTransaction,
		): Promise<void> => {
			const database = tx || dbInstance;

			/* `<group>:<action>` — the order the seeder produces and every
			   @PermissionAuth string is written in. Composing it the other way
			   round yields a row no guard can ever match. */
			const values = permissionData.actions.map((action) => ({
				name: `${permissionData.group}:${action}`,
				group: permissionData.group,
			}));

			await database.insert(permissions_table).values(values);
		},

		/* Which of these names already exist. Returns the collisions so the
		   service can name every one of them in a 422, rather than letting the
		   unique index on permissions.name surface as an unhandled 500. */
		findExistingByNames: async (
			names: string[],
			tx?: DbTransaction,
		): Promise<string[]> => {
			const database = tx || dbInstance;
			if (names.length === 0) {
				return [];
			}

			const rows = await database
				.select({ name: permissions_table.name })
				.from(permissions_table)
				.where(inArray(permissions_table.name, names));

			return rows.map((row) => row.name);
		},

		findOne: async (id: string): Promise<PermissionList | null> => {
			const permission = await dbInstance.query.permissions.findFirst({
				where: eq(permissions_table.id, id),
				columns: {
					id: true,
					name: true,
					group: true,
					created_at: true,
					updated_at: true,
				},
			});

			if (!permission) {
				return null;
			}

			return permission;
		},

		update: async (
			id: string,
			updateData: { name: string; group: string },
			tx?: DbTransaction,
		): Promise<void> => {
			const database = tx || dbInstance;

			const updatedName = `${updateData.name}:${updateData.group}`;

			await database
				.update(permissions_table)
				.set({
					name: updatedName,
					group: updateData.group,
				})
				.where(eq(permissions_table.id, id));
		},

		remove: async (id: string, tx?: DbTransaction): Promise<void> => {
			const database = tx || dbInstance;
			await database
				.delete(permissions_table)
				.where(eq(permissions_table.id, id));
		},
	};
};
