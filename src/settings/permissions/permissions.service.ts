import {
	Injectable,
	NotFoundException,
	UnprocessableEntityException,
} from "@nestjs/common";
import { CreatePermissionDto } from "./dto/create-permission.dto";
import { UpdatePermissionDto } from "./dto/update-permission.dto";
import { DatatableType, PaginationResponse } from "@common";
import {
	db,
	PermissionList,
	PermissionRepository,
	permissions_table,
} from "@repositories";
import { eq } from "drizzle-orm";
import { I18nService } from "nestjs-i18n";

@Injectable()
export class PermissionsService {
	constructor(private readonly i18n: I18nService) {}

	async create(createPermissionDto: CreatePermissionDto): Promise<void> {
		/* Check the names before writing. permissions.name is unique, so without
		   this a repeated action surfaces as a raw constraint violation and the
		   caller gets a 500 for an ordinary mistake — where every other
		   uniqueness failure in this codebase is a 422 with a field map. */
		const candidates = createPermissionDto.actions.map(
			(action) => `${createPermissionDto.group}:${action}`,
		);
		const existing =
			await PermissionRepository().findExistingByNames(candidates);

		if (existing.length > 0) {
			throw new UnprocessableEntityException({
				message: this.i18n.t("message.permission.already_exists"),
				error: {
					actions: existing.map((name) =>
						this.i18n.t("message.permission.already_exists_named", {
							args: { name },
						}),
					),
				},
			});
		}

		await db.transaction(async (tx) => {
			await PermissionRepository().create(createPermissionDto, tx);
		});
	}

	async findAll(
		query: DatatableType,
	): Promise<PaginationResponse<PermissionList>> {
		return await PermissionRepository().findAll(query);
	}

	async findOne(id: string): Promise<PermissionList> {
		const data = await PermissionRepository().findOne(id);
		if (!data) {
			throw new NotFoundException(
				this.i18n.t("message.permission.not_found", { args: { id } }),
			);
		}

		return data;
	}

	async update(
		id: string,
		updatePermissionDto: UpdatePermissionDto,
	): Promise<void> {
		const existingPermission = await db.query.permissions.findFirst({
			where: eq(permissions_table.id, id),
		});
		if (!existingPermission) {
			throw new NotFoundException(
				this.i18n.t("message.permission.not_found", { args: { id } }),
			);
		}

		await db.transaction(async (tx) => {
			await tx
				.update(permissions_table)
				.set({
					name: `${updatePermissionDto.group}:${updatePermissionDto.action}`,
					group: updatePermissionDto.group,
				})
				.where(eq(permissions_table.id, id));
		});
	}

	async remove(id: string): Promise<void> {
		const existingPermission = await db.query.permissions.findFirst({
			where: eq(permissions_table.id, id),
		});
		if (!existingPermission) {
			throw new NotFoundException(
				this.i18n.t("message.permission.not_found", { args: { id } }),
			);
		}

		await db.transaction(async (tx) => {
			await tx.delete(permissions_table).where(eq(permissions_table.id, id));
		});
	}
}
