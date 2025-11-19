import { HttpException, UnprocessableEntityException } from "@nestjs/common";
import { LoggerUtils } from "@utils";
import { Response } from "express";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const errorResponse = (res: Response, error: any) => {
	if (error instanceof HttpException) {
		if (error instanceof UnprocessableEntityException) {
			return res.status(422).json({
				code: 422,
				success: false,
				...(error.getResponse() as Record<string, unknown>),
				data: null,
			});
		}

		const status = error.getStatus();
		const message = error.getResponse();

		if (message instanceof Object) {
			const msg = message as { message?: string; error?: string };
			return res.status(status).json({
				code: status,
				success: false,
				message: msg.message ?? msg.error,
				data: null,
			});
		}

		return res.status(status).json({
			code: status,
			success: false,
			message: message,
			data: null,
		});
	}

	LoggerUtils.error(`Internal server error`, error);

	return res.status(500).json({
		code: 500,
		success: false,
		message: "Internal Server Error",
		data: null,
	});
};

export function successResponse<T>(
	statusCode: number,
	message: string = "Success",
	data: T,
): {
	code: number;
	success: boolean;
	message: string;
	data: T;
} {
	return {
		code: statusCode,
		success: true,
		message: message,
		data: data,
	};
}
