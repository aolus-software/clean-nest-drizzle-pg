import {
	Injectable,
	NestInterceptor,
	ExecutionContext,
	CallHandler,
	UnprocessableEntityException,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { diskStorage } from "multer";
import { extname } from "path";
import { Request } from "express";
import { allowedImageMimeTypes, maxUploadFile } from "@utils";

type MulterFileFilterCallback = (
	error: Error | null,
	acceptFile: boolean,
) => void;

export interface FileUploadOptions {
	destination?: string;

	filename?: (req: Request, file: Express.Multer.File) => string;
	preserveOriginalName?: boolean;
	maxUploadFile?: number;
	allowedMimeTypes?: string[];
}

export const createMulterConfig = (options: FileUploadOptions = {}) => ({
	storage: diskStorage({
		destination: options.destination || "./uploads",
		filename: (req, file, cb) => {
			if (options.filename) {
				const customFilename = options.filename(req, file);
				cb(null, customFilename);
			} else if (options.preserveOriginalName) {
				const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
				const name = file.originalname.split(".")[0];
				const ext = extname(file.originalname);
				cb(null, `${name}-${uniqueSuffix}${ext}`);
			} else {
				const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
				const ext = extname(file.originalname);
				const filename = `${file.fieldname}-${uniqueSuffix}${ext}`;
				cb(null, filename);
			}
		},
	}),
	fileFilter: (
		req: Request,
		file: Express.Multer.File,
		cb: MulterFileFilterCallback,
	) => {
		if (options.allowedMimeTypes && options.allowedMimeTypes.length > 0) {
			if (options.allowedMimeTypes.includes(file.mimetype)) {
				cb(null, true);
			} else {
				cb(
					new UnprocessableEntityException({
						message: `Unsupported file type ${extname(file.originalname)}`,
						error: {
							mimeType: [
								`Unsupported file type ${file.mimetype}, expected one of: ${options.allowedMimeTypes.join(", ")}`,
							],
						},
					}),
					false,
				);
			}
			return;
		}

		if (allowedImageMimeTypes.includes(file.mimetype)) {
			cb(null, true);
		} else {
			cb(
				new UnprocessableEntityException({
					message: `Unsupported file type ${extname(file.originalname)}`,
					error: {
						mimeType: [
							`Unsupported file type ${file.mimetype}, expected one of: ${allowedImageMimeTypes.join(", ")}`,
						],
					},
				}),
				false,
			);
		}
	},
	limits: {
		fileSize: options.maxUploadFile || maxUploadFile,
	},
});

// Keep the original config for backward compatibility
export const multerConfig = createMulterConfig();

@Injectable()
export class FileUploadInterceptor implements NestInterceptor {
	constructor(private readonly options: FileUploadOptions = {}) {}

	// eslint-disable-next-line
	intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
		createMulterConfig(this.options);
		return next.handle();
	}
}
