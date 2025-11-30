export type PaginationResponse<T> = {
	data: T[];
	meta: {
		page: number;
		limit: number;
		total: number;
	};
};
