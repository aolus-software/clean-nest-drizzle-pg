import { DatatableType, PaginationResponse, SortDirection } from "@common";
import { db, DbTransaction } from "@repositories";
import { and, asc, desc, eq, ilike, or, SQL } from "drizzle-orm";
import { permissions_table } from "../schema/rbac.schema";
import { defaultSort } from "@utils";

export interface PermissionList {
	id: string;
	name: string;
	group: string;
	created_at: Date;
	updated_at: Date;
}

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

			const validateOrderBy = {
				id: permissions_table.id,
				name: permissions_table.name,
				group: permissions_table.group,
				created_at: permissions_table.created_at,
				updated_at: permissions_table.updated_at,
			};

			type OrderableKey = keyof typeof validateOrderBy;
			const normalizedOrderBy: OrderableKey = (
				Object.keys(validateOrderBy) as OrderableKey[]
			).includes(orderBy as OrderableKey)
				? (orderBy as OrderableKey)
				: "id";

			const orderColumn = validateOrderBy[normalizedOrderBy];

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
			permissionData: { names: string[]; group: string },
			tx?: DbTransaction,
		): Promise<void> => {
			const database = tx || dbInstance;

			const values = permissionData.names.map((name) => ({
				name: `${name}:${permissionData.group}`,
				group: permissionData.group,
			}));

			await database.insert(permissions_table).values(values);
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
