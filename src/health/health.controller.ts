import { Controller, Get } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import {
	HealthCheck,
	HealthCheckService,
	MemoryHealthIndicator,
} from "@nestjs/terminus";
import { db } from "@repositories";

@Controller("health")
@ApiTags("Health")
export class HealthController {
	constructor(
		private health: HealthCheckService,
		private memory: MemoryHealthIndicator,
	) {}

	@Get()
	@HealthCheck()
	check() {
		return this.health.check([
			() => db.execute("SELECT 1").then(() => ({ db: { status: "up" } })),
			() => this.memory.checkHeap("memory_heap", 150 * 1024 * 1024),
		]);
	}

	@Get("live")
	liveness() {
		return { status: "ok" };
	}
}
