declare module "express" {
	interface Request {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		user: any;
	}
}

export {};
