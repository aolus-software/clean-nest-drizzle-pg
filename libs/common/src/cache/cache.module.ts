import { Global, Module } from "@nestjs/common";
import { CacheModule as NestCacheManager } from "@nestjs/cache-manager";
import { redisStore } from "cache-manager-ioredis-yet";
import { CacheService } from "./cache.service";

@Global()
@Module({
	imports: [
		NestCacheManager.registerAsync({
			useFactory: () => ({
				store: redisStore,
				host: process.env.REDIS_HOST,
				port: Number(process.env.REDIS_PORT),
				password: process.env.REDIS_PASSWORD || undefined,
				ttl: (Number(process.env.REDIS_TTL) || 3600) * 1000,
			}),
		}),
	],
	providers: [CacheService],
	exports: [CacheService],
})
export class CacheModule {}
