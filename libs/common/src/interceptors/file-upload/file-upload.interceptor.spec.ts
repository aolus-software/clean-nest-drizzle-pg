import { FileUploadInterceptor } from "./file-upload.interceptor";

describe("FileUploadInterceptor", () => {
	it("should be defined", () => {
		expect(new FileUploadInterceptor()).toBeDefined();
	});
});
