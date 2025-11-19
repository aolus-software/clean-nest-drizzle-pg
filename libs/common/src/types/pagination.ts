export type SortDirection = "asc" | "desc";

export type DatatableType = {
	page: number;
	limit: number;
	search: string | null;
	sort: string;
	sortDirection: SortDirection;

	// e.g ?filter[name]=John&filter[age]=30
	filter: Record<string, boolean | string | Date> | null;
};
