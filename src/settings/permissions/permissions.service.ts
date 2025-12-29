import { Injectable, NotFoundException } from "@nestjs/common";
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

@Injectable()
export class PermissionsService {
	async create(createPermissionDto: CreatePermissionDto): Promise<void> {
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
			throw new NotFoundException(`Permission with ID ${id} not found`);
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
			throw new NotFoundException(`Permission with ID ${id} not found`);
		}

		await db.transaction(async (tx) => {
			await tx
				.update(permissions_table)
				.set({
					name: `${updatePermissionDto.name}:${updatePermissionDto.group}`,
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
			throw new NotFoundException(`Permission with ID ${id} not found`);
		}

		await db.transaction(async (tx) => {
			await tx.delete(permissions_table).where(eq(permissions_table.id, id));
		});
	}
}
