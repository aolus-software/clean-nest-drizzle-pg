import { Controller, Get } from "@nestjs/common";
import { Public } from "@common";
import { ApiTags } from "@nestjs/swagger";
import {
	HealthCheck,
	HealthCheckService,
	HealthIndicatorService,
	MemoryHealthIndicator,
} from "@nestjs/terminus";
import { db } from "@repositories";

@Public()
@Controller("health")
@ApiTags("Health")
export class HealthController {
	constructor(
		private health: HealthCheckService,
		private memory: MemoryHealthIndicator,
		private healthIndicator: HealthIndicatorService,
	) {}

	/* Terminus 12 no longer accepts a hand-built `{ key: { status } }` object as an
	   indicator result; `HealthIndicatorService.attempt` builds a typed one and marks
	   the indicator down when the probe throws instead of rejecting the whole check. */
	@Get()
	@HealthCheck()
	check() {
		return this.health.check([
			() =>
				this.healthIndicator.check("db").attempt(async () => {
					await db.execute("SELECT 1");
				}),
			() => this.memory.checkHeap("memory_heap", 150 * 1024 * 1024),
		]);
	}

	@Get("live")
	liveness() {
		return { status: "ok" };
	}
}
