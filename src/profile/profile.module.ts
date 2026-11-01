import { Module } from "@nestjs/common";
import { CacheModule } from "@common";

import { ProfileController } from "./profile.controller";
import { ProfileService } from "./profile.service";

@Module({
	controllers: [ProfileController],
	providers: [ProfileService],
	imports: [CacheModule],
})
export class ProfileModule {}
