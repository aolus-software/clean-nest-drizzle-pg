import {
	and,
	eq,
	isNull,
	or,
	ilike,
	SQL,
	asc,
	desc,
	exists,
} from "drizzle-orm";
import { DbTransaction } from ".";
import {
	user_roles_table,
	users_table,
	UserStatusEnum,
} from "@repositories/schema";
import { DatatableType, PaginationResponse, SortDirection } from "@common";
import { defaultSort, HashUtils } from "@utils";
import { db } from "@repositories";
import {
	NotFoundException,
	UnauthorizedException,
	UnprocessableEntityException,
} from "@nestjs/common";

export type UserList = {
	id: string;
	name: string;
	email: string;
	status: UserStatusEnum | null;
	roles: string[] | null;
	created_at: Date | null;
	updated_at: Date | null;
};

export type UserCreate = {
	name: string;
	email: string;
	password: string;
	status?: UserStatusEnum;
	remark?: string;
	role_ids?: string[];
};

export type UserDetail = {
	id: string;
	name: string;
	email: string;
	status: UserStatusEnum | null;
	remark: string | null;
	roles: {
		id: string;
		name: string;
	}[];
	created_at: Date | null;
	updated_at: Date | null;
};

export type UserForAuth = {
	id: string;
	name: string;
	email: string;
	password: string;
	status: UserStatusEnum | null;
	email_verified_at: Date | null;
};

export interface UserInformation {
	id: string;
	email: string;
	name: string;
	roles: string[];
	permissions: {
		name: string;
		permissions: string[];
	}[];
}

export const UserRepository = () => {
	const dbInstance = db;

	return {
		db: dbInstance,
		getDb: (tx?: DbTransaction) => tx || dbInstance,

		findAll: async (
			queryParam: DatatableType,
			tx?: DbTransaction,
		): Promise<PaginationResponse<UserList>> => {
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

			let whereCondition: SQL | undefined = isNull(users_table.deleted_at);
			if (search) {
				whereCondition = and(
					whereCondition,
					or(
						ilike(users_table.name, `%${search}%`),
						ilike(users_table.email, `%${search}%`),
						ilike(users_table.status, `%${search}%`),
					),
				);
			}

			let filteredCondition: SQL | undefined = undefined;
			if (filter) {
				if (filter.status) {
					filteredCondition = and(
						whereCondition,
						eq(users_table.status, filter.status as UserStatusEnum),
					);
				}

				if (filter.name) {
					filteredCondition = and(
						whereCondition,
						ilike(users_table.name, `%${filter.name.toString()}%`),
					);
				}

				if (filter.email) {
					filteredCondition = and(
						whereCondition,
						ilike(users_table.email, `%${filter.email.toString()}%`),
					);
				}

				if (filter.role_id) {
					filteredCondition = and(
						whereCondition,
						exists(
							database
								.select()
								.from(user_roles_table)
								.where(
									and(
										eq(user_roles_table.user_id, users_table.id),
										eq(user_roles_table.role_id, filter.role_id as string),
									),
								),
						),
					);
				}
			}

			const finalWhereCondition: SQL | undefined = and(
				whereCondition,
				filteredCondition ? filteredCondition : undefined,
			);

			const validateOrderBy = {
				id: users_table.id,
				name: users_table.name,
				email: users_table.email,
				status: users_table.status,
				created_at: users_table.created_at,
				updated_at: users_table.updated_at,
			};

			type OrderableKey = keyof typeof validateOrderBy;
			const normalizedOrderBy: OrderableKey = (
				Object.keys(validateOrderBy) as OrderableKey[]
			).includes(orderBy as OrderableKey)
				? (orderBy as OrderableKey)
				: ("id" as OrderableKey);

			const orderColumn = validateOrderBy[normalizedOrderBy];

			const [data, totalCount] = await Promise.all([
				database.query.users.findMany({
					where: finalWhereCondition,
					orderBy:
						orderDirection === "asc" ? asc(orderColumn) : desc(orderColumn),
					limit,
					offset,
					columns: {
						id: true,
						name: true,
						email: true,
						status: true,
						created_at: true,
						updated_at: true,
					},
					with: {
						user_roles: {
							columns: {
								role_id: true,
								user_id: true,
							},
							with: {
								role: {
									columns: {
										id: true,
										name: true,
									},
								},
							},
						},
					},
				}),
				database.$count(users_table, finalWhereCondition),
			]);

			const formattedData: UserList[] = data.map((user) => ({
				id: user.id,
				name: user.name,
				email: user.email,
				status: user.status,
				roles: user.user_roles.map((userRole) => userRole.role.name),
				created_at: user.created_at,
				updated_at: user.updated_at,
			}));

			return {
				data: formattedData,
				meta: {
					page,
					limit,
					total: totalCount,
				},
			};
		},

		create: async (data: UserCreate, tx?: DbTransaction): Promise<void> => {
			const database = tx || dbInstance;

			// validate is the email exist
			const isEmailExist = await database
				.select()
				.from(users_table)
				.where(
					and(
						eq(users_table.email, data.email),
						isNull(users_table.deleted_at),
					),
				)
				.limit(1);

			if (isEmailExist.length > 0) {
				throw new UnprocessableEntityException({
					message: "Validation error",
					errors: [
						{
							field: "email",
							message: "Email already exists",
						},
					],
				});
			}

			const hashedPassword = await HashUtils.generateHash(data.password);
			const user = await database
				.insert(users_table)
				.values({
					name: data.name,
					email: data.email,
					password: hashedPassword,
					status: data.status || "active",
					remark: data.remark || null,
				})
				.returning();

			if (data.role_ids && data.role_ids.length > 0) {
				if (user.length > 0) {
					const userId = user[0].id;
					const userRoles: {
						user_id: string;
						role_id: string;
					}[] = data.role_ids.map((roleId) => ({
						user_id: userId,
						role_id: roleId,
					}));

					await database.insert(user_roles_table).values(userRoles);
				}
			}
		},

		getDetail: async (
			userId: string,
			tx?: DbTransaction,
		): Promise<UserDetail> => {
			const database = tx || dbInstance;
			const user = await database.query.users.findFirst({
				where: and(eq(users_table.id, userId), isNull(users_table.deleted_at)),

				columns: {
					id: true,
					name: true,
					email: true,
					status: true,
					remark: true,
					created_at: true,
					updated_at: true,
				},

				with: {
					user_roles: {
						columns: {
							role_id: true,
							user_id: true,
						},

						with: {
							role: {
								columns: {
									id: true,
									name: true,
								},
							},
						},
					},
				},
			});

			if (!user) {
				throw new NotFoundException("User not found");
			}

			return {
				id: user.id,
				name: user.name,
				email: user.email,
				status: user.status,
				remark: user.remark,
				roles: user.user_roles.map((userRole) => ({
					id: userRole.role.id,
					name: userRole.role.name,
				})),
				created_at: user.created_at,
				updated_at: user.updated_at,
			};
		},

		update: async (
			userId: string,
			data: Omit<UserCreate, "password">,
			tx?: DbTransaction,
		): Promise<void> => {
			const database = tx || dbInstance;
			const user = await database.query.users.findFirst({
				where: and(eq(users_table.id, userId), isNull(users_table.deleted_at)),
			});

			if (!user) {
				throw new NotFoundException("User not found");
			}

			await database
				.update(users_table)
				.set({
					name: data.name,
					email: data.email,
					status: data.status || user.status,
					remark: data.remark || user.remark,
				})
				.where(eq(users_table.id, userId));

			// remove all role or adding new role
			if (data.role_ids && data.role_ids.length > 0) {
				await database
					.delete(user_roles_table)
					.where(eq(user_roles_table.user_id, userId));

				const userRoles: {
					user_id: string;
					role_id: string;
				}[] = data.role_ids.map((roleId) => ({
					user_id: userId,
					role_id: roleId,
				}));
				await database.insert(user_roles_table).values(userRoles);
			} else {
				await database
					.delete(user_roles_table)
					.where(eq(user_roles_table.user_id, userId));
			}
		},

		delete: async (userId: string, tx?: DbTransaction): Promise<void> => {
			const database = tx || dbInstance;
			const user = await database.query.users.findFirst({
				where: and(eq(users_table.id, userId), isNull(users_table.deleted_at)),
			});

			if (!user) {
				throw new NotFoundException("User not found");
			}

			await database
				.update(users_table)
				.set({ deleted_at: new Date() })
				.where(eq(users_table.id, userId));
		},

		UserInformation: async (
			userId: string,
			tx?: DbTransaction,
		): Promise<UserInformation> => {
			const database = tx || dbInstance;
			const user = await database.query.users.findFirst({
				where: and(
					eq(users_table.id, userId),
					eq(users_table.status, "active"),
					isNull(users_table.deleted_at),
				),

				columns: {
					id: true,
					email: true,
					name: true,
				},

				with: {
					user_roles: {
						columns: {
							role_id: true,
							user_id: true,
						},

						with: {
							role: {
								columns: {
									id: true,
									name: true,
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
												},
											},
										},
									},
								},
							},
						},
					},
				},
			});

			if (!user) {
				throw new UnauthorizedException("Unauthorized");
			}

			return {
				id: user.id,
				email: user.email,
				name: user.name,
				roles: user.user_roles.map((userRole) => userRole.role.name),
				permissions: user.user_roles.map((userRole) => ({
					name: userRole.role.name,
					permissions: userRole.role.role_permissions.map(
						(rolePermission) => rolePermission.permission.name,
					),
				})),
			};
		},

		findByEmail: async (
			email: string,
			tx?: DbTransaction,
		): Promise<UserForAuth> => {
			const database = tx || dbInstance;
			const user = await database.query.users.findFirst({
				where: and(
					eq(users_table.email, email),
					isNull(users_table.deleted_at),
				),
				columns: {
					id: true,
					name: true,
					email: true,
					password: true,
					status: true,
					email_verified_at: true,
				},
			});

			if (!user) {
				throw new UnprocessableEntityException({
					message: "Invalid credentials",
				});
			}

			return user;
		},
	};
};
