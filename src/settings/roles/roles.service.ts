import {
	Injectable,
	NotFoundException,
	UnprocessableEntityException,
} from "@nestjs/common";
import { CreateRoleDto } from "./dto/create-role.dto";
import { UpdateRoleDto } from "./dto/update-role.dto";
import { DatatableType, PaginationResponse } from "@common";
import {
	db,
	RoleDetail,
	RoleList,
	RoleRepository,
	roles_table,
} from "@repositories";
import { and, eq, not } from "drizzle-orm";
import { I18nService } from "nestjs-i18n";

@Injectable()
export class RolesService {
	constructor(private readonly i18n: I18nService) {}

	async create(createRoleDto: CreateRoleDto): Promise<void> {
		const isNameExists = await db.query.roles.findFirst({
			where: eq(roles_table.name, createRoleDto.name),
			columns: { id: true },
		});

		if (isNameExists) {
			throw new UnprocessableEntityException({
				message: this.i18n.t("message.role.name_exists"),
				error: {
					name: [this.i18n.t("message.role.name_exists")],
				},
			});
		}

		const permissionExists = await db.query.permissions.findMany({
			where: (permissions_table, { or, inArray }) =>
				or(inArray(permissions_table.id, createRoleDto.permissionIds)),
			columns: { id: true },
		});

		if (permissionExists.length !== createRoleDto.permissionIds.length) {
			throw new UnprocessableEntityException({
				message: this.i18n.t("message.role.permissions_invalid"),
				error: {
					permissionIds: [this.i18n.t("message.role.permissions_invalid")],
				},
			});
		}

		await db.transaction(async (tx) => {
			await RoleRepository().create(createRoleDto, tx);
		});
	}

	async findAll(
		queryParam: DatatableType,
	): Promise<PaginationResponse<RoleList>> {
		return await RoleRepository().findAll(queryParam);
	}

	async findOne(id: string): Promise<RoleDetail> {
		const role = await RoleRepository().findOne(id);
		if (!role) {
			throw new NotFoundException(this.i18n.t("message.role.not_found"));
		}

		return role;
	}

	async update(id: string, updateRoleDto: UpdateRoleDto): Promise<void> {
		const RoleExist = await RoleRepository().findOne(id);
		if (!RoleExist) {
			throw new NotFoundException(this.i18n.t("message.role.not_found"));
		}

		const isNameExists = await db.query.roles.findFirst({
			where: and(
				not(eq(roles_table.id, id)),
				eq(roles_table.name, updateRoleDto.name),
			),
			columns: { id: true },
		});

		if (isNameExists) {
			throw new UnprocessableEntityException({
				message: this.i18n.t("message.role.name_exists"),
				error: {
					name: [this.i18n.t("message.role.name_exists")],
				},
			});
		}

		const permissionExists = await db.query.permissions.findMany({
			where: (permissions_table, { or, inArray }) =>
				or(inArray(permissions_table.id, updateRoleDto.permissionIds)),
			columns: { id: true },
		});

		if (permissionExists.length !== updateRoleDto.permissionIds.length) {
			throw new UnprocessableEntityException({
				message: this.i18n.t("message.role.permissions_invalid"),
				error: {
					permissionIds: [this.i18n.t("message.role.permissions_invalid")],
				},
			});
		}

		await db.transaction(async (tx) => {
			await RoleRepository().update(id, updateRoleDto, tx);
		});
	}

	async remove(id: string): Promise<void> {
		await db.transaction(async (tx) => {
			await RoleRepository().delete(id, tx);
		});
	}
}
