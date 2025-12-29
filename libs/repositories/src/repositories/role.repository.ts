import { DatatableType, PaginationResponse, SortDirection } from "@common";
import {
	db,
	DbTransaction,
	role_permissions_table,
	roles_table,
} from "@repositories";
import { defaultSort } from "@utils";
import { and, asc, desc, eq, ilike, or, SQL } from "drizzle-orm";

export interface RoleList {
	id: string;
	name: string;
	created_at: Date;
	updated_at: Date;
}

export interface RoleDetail {
	id: string;
	name: string;
	created_at: Date;
	updated_at: Date;

	permissions: {
		[key: string]: {
			id: string;
			name: string;
			group: string;
			is_assigned: boolean;
		};
	}[];
}

export const RoleRepository = () => {
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
		): Promise<PaginationResponse<RoleList>> => {
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
					or(ilike(roles_table.name, `%${search}%`)),
				);
			}

			let filterWhereCondition: SQL | undefined = undefined;
			if (filter) {
				if (filter.name) {
					filterWhereCondition = and(
						filterWhereCondition,
						eq(roles_table.name, `%${filter.name.toString()}%`),
					);
				}
			}

			const validateOrderBy = {
				id: roles_table.id,
				name: roles_table.name,
				created_at: roles_table.created_at,
				updated_at: roles_table.updated_at,
			};

			type OrderableKey = keyof typeof validateOrderBy;
			const normalizedOrderBy: OrderableKey = (
				Object.keys(validateOrderBy) as OrderableKey[]
			).includes(orderBy as OrderableKey)
				? (orderBy as OrderableKey)
				: ("id" as OrderableKey);

			const orderColumn = validateOrderBy[normalizedOrderBy];
			const finalWhereCondition: SQL | undefined = and(
				whereCondition,
				filterWhereCondition,
			);

			const [data, total] = await Promise.all([
				database.query.roles.findMany({
					where: finalWhereCondition,
					orderBy:
						orderDirection === "asc" ? asc(orderColumn) : desc(orderColumn),
					limit,
					offset,
					columns: {
						id: true,
						name: true,
						created_at: true,
						updated_at: true,
					},
				}),
				database.$count(roles_table, finalWhereCondition),
			]);

			return {
				data,
				meta: {
					page,
					limit,
					totalCount: total,
					totalPages: Math.ceil(total / limit),
				},
			};
		},

		create: async (
			roleData: { name: string; permission_ids?: string[] },
			tx?: DbTransaction,
		): Promise<string> => {
			const database = tx || dbInstance;

			const result = await database
				.insert(roles_table)
				.values({
					name: roleData.name,
				})
				.returning({ id: roles_table.id });

			const role = result[0];
			if (roleData.permission_ids && roleData.permission_ids.length > 0) {
				const rolePermissions = roleData.permission_ids.map(
					(permission_id) => ({
						role_id: role.id,
						permission_id,
					}),
				);

				await database.insert(role_permissions_table).values(rolePermissions);
			}

			return role.id;
		},

		findOne: async (
			id: string,
			tx?: DbTransaction,
		): Promise<RoleDetail | null> => {
			const database = tx || dbInstance;

			const role = await database.query.roles.findFirst({
				where: eq(roles_table.id, id),
				columns: {
					id: true,
					name: true,
					created_at: true,
					updated_at: true,
				},
				with: {
					role_permissions: {
						columns: {
							role_id: true,
							permission_id: true,
						},
						with: {
							permission: {
								columns: {
									id: true,
									name: true,
									group: true,
									created_at: true,
									updated_at: true,
								},
							},
						},
					},
				},
			});

			if (!role) {
				return null;
			}

			const permissions = await database.query.permissions.findMany({
				columns: {
					id: true,
					name: true,
					group: true,
				},
			});

			return {
				id: role.id,
				name: role.name,
				created_at: role.created_at,
				updated_at: role.updated_at,
				permissions: permissions.map((permission) => {
					const isAssigned = role.role_permissions.some(
						(rp) => rp.permission.id === permission.id,
					);
					return {
						[permission.group]: {
							id: permission.id,
							name: permission.name,
							group: permission.group,
							is_assigned: isAssigned,
						},
					};
				}),
			};
		},

		update: async (
			id: string,
			roleData: { name?: string; permission_ids?: string[] },
			tx?: DbTransaction,
		): Promise<void> => {
			const database = tx || dbInstance;

			await database
				.update(roles_table)
				.set({
					name: roleData.name,
					updated_at: new Date(),
				})
				.where(eq(roles_table.id, id));

			if (roleData.permission_ids) {
				await database
					.delete(role_permissions_table)
					.where(eq(role_permissions_table.role_id, id));

				if (roleData.permission_ids.length > 0) {
					const rolePermissions = roleData.permission_ids.map(
						(permission_id) => ({
							role_id: id,
							permission_id,
						}),
					);

					await database.insert(role_permissions_table).values(rolePermissions);
				}
			}
		},

		delete: async (id: string, tx?: DbTransaction): Promise<void> => {
			const database = tx || dbInstance;

			await database.delete(roles_table).where(eq(roles_table.id, id));
		},
	};
};
