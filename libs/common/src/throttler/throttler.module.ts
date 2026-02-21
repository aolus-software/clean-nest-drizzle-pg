import { getEnv } from "@config";
import { Module } from "@nestjs/common";
import {
	ThrottlerModule as NodeThrottlerModule,
	seconds,
} from "@nestjs/throttler";

@Module({
	imports: [
		NodeThrottlerModule.forRoot({
			throttlers: [
				{
					ttl: seconds(getEnv().THROTTLER_TTL || 60),
					limit: Number(getEnv().THROTTLER_LIMIT) || 100,
				},
			],
		}),
	],

	exports: [ThrottlerModule],
})
export class ThrottlerModule {}
