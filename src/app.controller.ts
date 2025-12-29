import { Controller, Get, Res } from "@nestjs/common";
import { FastifyReply } from "fastify";

@Controller()
export class AppController {
	@Get()
	getHello(@Res() res: FastifyReply): FastifyReply {
		return res.send({
			message: "Welcome to the backend service",
		});
	}
}
