import { Global, Module } from "@nestjs/common";
import { CacheModule as NestCacheManager } from "@nestjs/cache-manager";
import { redisStore } from "cache-manager-ioredis-yet";
import { CacheService } from "./cache.service";
import { getEnv } from "@config";

@Global()
@Module({
	imports: [
		NestCacheManager.registerAsync({
			useFactory: () => ({
				store: redisStore,
				host: getEnv().REDIS_HOST,
				port: Number(getEnv().REDIS_PORT),
				password: getEnv().REDIS_PASSWORD || undefined,
				ttl: (Number(getEnv().REDIS_TTL) || 3600) * 1000,
			}),
		}),
	],
	providers: [CacheService],
	exports: [CacheService],
})
export class CacheModule {}
