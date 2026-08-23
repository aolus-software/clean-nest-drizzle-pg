import { DatatableType, PaginationResponse, SortDirection } from "@common";
import {
	db,
	DbTransaction,
	role_permissions_table,
	roles_table,
} from "@repositories";
import { defaultSort } from "@utils";
import { and, asc, desc, eq, ilike, or, SQL } from "drizzle-orm";
import { BadRequestException } from "@nestjs/common";
import { I18nContext } from "nestjs-i18n";

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

/* Sortable columns, keyed by the name the API accepts in ?sort=. Keys are
   camelCase so the wire contract matches the sibling Prisma template and the
   shared defaultSort constant; values are the snake_case Drizzle columns they
   map onto. */
const roleOrderableColumns = {
	id: roles_table.id,
	name: roles_table.name,
	createdAt: roles_table.created_at,
	updatedAt: roles_table.updated_at,
};

/* The ?sort= and filter[...] values this repository accepts. Exported so the
   controller can document them in Swagger from one source of truth rather than
   restating the list. An unrecognised value is rejected, not ignored. */
export const roleSortableFields = Object.keys(roleOrderableColumns);
export const roleFilterableFields = ["name"];

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

			if (filter) {
				for (const key of Object.keys(filter)) {
					if (!roleFilterableFields.includes(key)) {
						throw new BadRequestException(
							I18nContext.current()?.t("message.common.invalid_filter_field") ??
								"Invalid filter field",
						);
					}
				}
			}

			let filterWhereCondition: SQL | undefined = undefined;
			if (filter) {
				if (filter.name) {
					/* ilike, not eq. eq renders "=", which does not interpret the
					   surrounding % — the predicate became name = '%admin%' and
					   matched only a role literally named that, so this filter
					   could never return a row. */
					filterWhereCondition = and(
						filterWhereCondition,
						ilike(roles_table.name, `%${filter.name.toString()}%`),
					);
				}
			}

			type OrderableKey = keyof typeof roleOrderableColumns;
			const orderableKeys = roleSortableFields as OrderableKey[];

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

			const orderColumn = roleOrderableColumns[orderBy as OrderableKey];
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

		/* The input field is permissionIds, matching the DTO. It used to be
		   permission_ids, which no caller ever sent — the property is optional,
		   so TypeScript accepted the DTO and the whole permission block was
		   skipped at runtime. Creating or updating a role silently assigned no
		   permissions while reporting success. */
		create: async (
			roleData: { name: string; permissionIds?: string[] },
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
			if (roleData.permissionIds && roleData.permissionIds.length > 0) {
				const rolePermissions = roleData.permissionIds.map((permission_id) => ({
					role_id: role.id,
					permission_id,
				}));

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
			roleData: { name?: string; permissionIds?: string[] },
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

			if (roleData.permissionIds) {
				await database
					.delete(role_permissions_table)
					.where(eq(role_permissions_table.role_id, id));

				if (roleData.permissionIds.length > 0) {
					const rolePermissions = roleData.permissionIds.map(
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
