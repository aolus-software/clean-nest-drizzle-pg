# GitHub Copilot Instructions

## Role and Context

You are acting as a senior NestJS developer with expertise in:

- NestJS framework with Fastify adapter
- Bun runtime environment
- Drizzle ORM with PostgreSQL
- Redis for caching
- BullMQ for job queues
- Passport.js with JWT strategy

## Code Style Requirements

### No Icons Policy

Do not use any icons, emojis, or decorative symbols in code, comments, documentation, or commit messages.

### Comment Style

- Write comments for documentation purposes only
- Use descriptive block comments to explain what functions, classes, or complex logic blocks do
- Do not comment every 2-3 lines
- Do not explain what individual lines do
- Focus on the "why" and "what" at a high level, not the "how" line-by-line

Example of good commenting:

```typescript
/**
 * Validates user credentials against the database and issues JWT tokens.
 * Clears existing cache before refreshing user information.
 */
async login(data: LoginDto): Promise<LoginResult> {
  // implementation
}
```

Example of bad commenting (avoid this):

```typescript
// Find user by email
const user = await UserRepository().findByEmail(data.email);
// Check if user exists
if (!user) {
  // Throw error
  throw new UnprocessableEntityException({ ... });
}
```

### Documentation Policy

- Do not create separate documentation files, README updates, or change logs unless explicitly requested
- Provide a brief summary in chat when asked
- Keep responses concise and focused on the code implementation

## Project Structure

```
src/
  app.module.ts         - Root module
  main.ts               - Application bootstrap
  auth/                 - Auth module (controller, service, DTOs)
  settings/             - Settings module (users, roles, permissions)
  health/               - Health check module
libs/
  common/src/           - Shared utilities
    cache/              - CacheService
    decorators/         - CurrentUser, RoleAuth, PermissionAuth, ApiStandardResponses, ApiSuccessResponse, DefaultApiNotFoundResponse, ApiDatatableQueries
    guards/             - AuthGuard, RoleGuard, PermissionGuard
    interceptors/       - FileUpload interceptors
    mail/               - MailService
    pipes/              - CustomValidationPipe, FilterValidationPipe
    response/           - ResponseHandler
    strategies/         - Passport JWT strategy
    throttler/          - Rate limiting
    types/              - DatatableType, PaginationResponse, SortDirection, shared TypeScript types
  config/src/           - App configuration
    app/                - CorsConfig, HelmetConfig, swaggerConfig
    env/                - getEnv() validated environment config
  repositories/src/     - Database layer
    repositories/       - UserRepository, RoleRepository, PermissionRepository
    schema/             - Drizzle table definitions
    migrations/         - Drizzle migrations
  utils/src/            - Utility functions
    hash/               - HashUtils
    jwt/                - JWTUtils
    date/               - DateUtils
    string/             - StrUtils
    number/             - NumberUtils
    logger/             - LoggerUtils
    encryption/         - EncryptionUtils
    default/            - paginationLength, defaultSort, maxUploadFile, allowedImageMimeTypes, allowedFileMimeTypes, emailVerificationLifetime, resetPasswordLifetime
```

## Path Aliases

Use the configured tsconfig path aliases for imports:

```typescript
import {
	CacheService,
	MailService,
	UserCache,
	AuthGuard,
	CurrentUser,
	ResponseHandler,
	DatatableType,
	PaginationResponse,
	SortDirection,
	FilterValidationPipe,
	ApiDatatableQueries,
	ApiSuccessResponse,
	DefaultApiNotFoundResponse,
} from "@common";
import {
	UserRepository,
	UserInformation,
	db,
	users_table,
} from "@repositories";
import { HashUtils, JWTUtils, DateUtils, StrUtils, LoggerUtils, NumberUtils, paginationLength, defaultSort } from "@utils";
import { getEnv, CorsConfig, HelmetConfig, swaggerConfig } from "@config";
```

**Available aliases:**

- `@common` - Shared NestJS providers (guards, decorators, interceptors, response, cache, mail, pipes, types)
- `@repositories` - Database access layer (repositories, schema, `db` instance, table definitions)
- `@utils` - Utility functions (hash, jwt, date, string, number, logger, encryption, default constants)
- `@config` - App configuration (environment validation via `getEnv()`, CORS/Helmet/Swagger configs)

## NestJS Patterns

### Controller Pattern

Controllers should be thin and delegate all business logic to services:

```typescript
@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("/login")
  @ApiResponse({ status: 200, description: "Login successful", schema: { ... } })
  @ApiStandardResponses({ unauthorized: false, forbidden: false })
  async login(@Body() data: LoginDto, @Res() res: FastifyReply) {
    try {
      const result = await this.authService.login(data);
      return res.status(200).send(
        ResponseHandler.success(200, "Login successful", result),
      );
    } catch (error) {
      ResponseHandler.handleError(res, error);
    }
  }

  @Get("/profile")
  @UseGuards(AuthGuard)
  @ApiBearerAuth("Bearer")
  @ApiStandardResponses({ forbidden: false })
  profile(@Res() res: FastifyReply, @CurrentUser() user: UserInformation) {
    try {
      return res.status(200).send(
        ResponseHandler.success(200, "Profile fetched successfully", user),
      );
    } catch (error) {
      ResponseHandler.handleError(res, error);
    }
  }
}
```

### Service Pattern

Services use `@Injectable()` and receive dependencies via constructor injection:

```typescript
@Injectable()
export class AuthService {
	constructor(
		private readonly cacheService: CacheService,
		private readonly mailService: MailService,
	) {}

	async login(
		data: LoginDto,
	): Promise<{
		user: UserInformation;
		accessToken: string;
		refreshToken: string;
	}> {
		const user = await UserRepository().findByEmail(data.email);
		if (!user) {
			throw new UnprocessableEntityException({
				message: "Invalid email or password",
				error: { email: ["Invalid email or password"] },
			});
		}
		// implementation
	}
}
```

### Module Pattern

```typescript
@Module({
	imports: [CommonModule, RepositoriesModule, UtilsModule],
	controllers: [AuthController],
	providers: [AuthService],
})
export class AuthModule {}
```

### DTO Pattern

Use class-validator decorators for validation:

```typescript
export class LoginDto {
	@IsEmail()
	@IsNotEmpty()
	email: string;

	@IsString()
	@IsNotEmpty()
	password: string;
}

export class RegisterDto {
	@IsString()
	@IsNotEmpty()
	name: string;

	@IsEmail()
	@IsNotEmpty()
	email: string;

	@IsString()
	@Matches(StrongPassword)
	password: string;
}
```

### Error Handling

Use NestJS built-in HTTP exceptions. Prefer `UnprocessableEntityException` for validation-related business errors:

```typescript
throw new UnprocessableEntityException({
	message: "Email already in use",
	error: {
		email: ["Email already in use"],
	},
});

throw new UnauthorizedException("Unauthorized access");
throw new NotFoundException("Resource not found");
throw new ForbiddenException("Access forbidden");
```

Always use `ResponseHandler.handleError(res, error)` in controllers to centralize error response formatting.

## Database Operations (Drizzle ORM)

### Repository Pattern

Repositories export factory functions returning database access methods:

```typescript
export const UserRepository = () => {
	const dbInstance = db;

	return {
		db: dbInstance,
		getDb: (tx?: DbTransaction) => tx || dbInstance,

		findByEmail: async (email: string) => {
			const result = await dbInstance
				.select()
				.from(users_table)
				.where(eq(users_table.email, email))
				.limit(1);
			return result[0] || null;
		},

		UserInformation: async (id: string): Promise<UserInformation | null> => {
			// implementation
		},
	};
};
```

### Drizzle Queries

```typescript
// Simple query
const user = await db
	.select()
	.from(users_table)
	.where(eq(users_table.id, userId))
	.limit(1);

// Query with joins
const result = await db
	.select({
		id: users_table.id,
		name: users_table.name,
		role: roles_table.name,
	})
	.from(users_table)
	.leftJoin(user_roles_table, eq(users_table.id, user_roles_table.user_id))
	.leftJoin(roles_table, eq(user_roles_table.role_id, roles_table.id))
	.where(eq(users_table.id, userId));
```

### Transactions

```typescript
await db.transaction(async (tx) => {
  const newUser = await UserRepository().getDb(tx).insert(users_table).values({ ... }).returning();
  await tx.insert(email_verifications_table).values({ user_id: newUser[0].id, ... });
});
```

### Schema Definitions

Keep schema files in `libs/repositories/src/schema/`. Migrations go in `libs/repositories/src/migrations/`.

## Response Handling

Use `ResponseHandler` from `@common` for all responses:

```typescript
// Success
ResponseHandler.success(200, "Operation successful", data);
ResponseHandler.success(201, "Created successfully", null);

// Error (centralized)
ResponseHandler.handleError(res, error);
```

## Caching

Use `CacheService` injected via constructor:

```typescript
// Set cache (null TTL = no expiry)
await this.cacheService.set<UserInformation>(
	UserCache(user.id),
	userInformation,
	null,
);

// Get cache
const cached = await this.cacheService.get<UserInformation>(UserCache(user.id));

// Delete cache
await this.cacheService.del(UserCache(user.id));
```

## Security

Use utilities from `@utils` for hashing and JWT:

```typescript
const hashed = await HashUtils.generateHash(password);
const isValid = await HashUtils.compareHash(plaintext, hashed);

const accessToken = JWTUtils.generateAccessToken({ sub: user.id });
const refreshToken = JWTUtils.generateRefreshToken({ sub: user.id });
```

Apply guards with decorators:

```typescript
@UseGuards(AuthGuard)            // JWT authentication
@UseGuards(RoleGuard("admin"))   // Role-based access
@UseGuards(PermissionGuard("users:read"))  // Permission-based access
```

## Queue and Background Jobs

Define queues and workers using BullMQ with `@nestjs/bullmq`:

```typescript
// Queue registration in module
BullModule.registerQueue({ name: "send-email" })

// Producer
@InjectQueue("send-email")
private readonly sendMailQueue: Queue

await this.sendMailQueue.add("send", { to, subject, template, context });

// Consumer
@Processor("send-email")
export class SendMailWorker {
  @Process("send")
  async handleSend(job: Job<EmailOptions>) {
    // implementation
  }
}
```

## Swagger Documentation

Use `@nestjs/swagger` decorators on all controllers:

```typescript
@ApiResponse({ status: 200, description: "Success", schema: { ... } })
@ApiStandardResponses({ unauthorized: false, forbidden: false })  // custom decorator from @common
@ApiSuccessResponse(200, "Users fetched", exampleData, schemaProperties)  // typed success response
@DefaultApiNotFoundResponse("User")  // standard 404 response
@ApiBearerAuth("Bearer")  // for protected endpoints
@ApiDatatableQueries()  // adds page/limit/search/sort/filter query params to Swagger
```

## Datatable / Pagination

For list endpoints that support filtering, sorting, and pagination, use the `DatatableType` query type with `FilterValidationPipe`:

```typescript
@Get()
@ApiDatatableQueries()
async findAll(
	@Query("page") page: number = 1,
	@Query("limit") limit: number = paginationLength,
	@Query("search") search: string | null = null,
	@Query("sort") sort: string = defaultSort,
	@Query("sortDirection") sortDirection: SortDirection = "desc",
	@Query(FilterValidationPipe) filter: DatatableType["filter"] = null,
	@Res() res: FastifyReply,
) {
	try {
		const result = await this.service.findAll({ page, limit, search, sort, sortDirection, filter });
		return res.status(200).send(ResponseHandler.success(200, "Fetched successfully", result));
	} catch (error) {
		ResponseHandler.handleError(res, error);
	}
}
```

Services return `PaginationResponse<T>` for paginated results:

```typescript
return {
	data: rows,
	meta: { page, limit, totalCount, totalPages },
} satisfies PaginationResponse<UserList>;
```

## Logging

Use `LoggerUtils` from `@utils`:

```typescript
import { LoggerUtils } from "@utils";

LoggerUtils.log("User logged in", { userId });
LoggerUtils.warn("Warning occurred", { context });
LoggerUtils.error("Error occurred", error);
```

## Configuration

Use `getEnv()` from `@config` to access validated environment variables. It uses `envalid` for validation and caches the result on first call. Never use `process.env` directly.

```typescript
import { getEnv } from "@config";

const port = getEnv().APP_PORT;
const dbUrl = getEnv().DATABASE_URL;
const frontendUrl = getEnv().FRONTEND_URL;
```

App-level configs (CORS, Helmet, Swagger) are pre-built in `@config` and applied in `main.ts`:

```typescript
import { CorsConfig, HelmetConfig, swaggerConfig } from "@config";

app.enableCors(CorsConfig);
await app.register(fastifyHelmet, HelmetConfig);
```

- Do not use `@nestjs/config` `ConfigService` for reading env vars; use `getEnv()` instead
- Swagger docs are only registered in non-production environments

## Code Organization

- Keep controllers thin, delegate all business logic to services
- Use repository pattern for all database access
- Services have single responsibility
- Use TypeScript strict mode
- Prefer async/await over promises
- Avoid `any` type; use proper types or `unknown` with type guards
- No `console.log` in production code, use `LoggerUtils` instead
- Handle all errors explicitly, no silent failures
- Follow clean architecture: controllers -> services -> repositories

## File Naming

- `auth.controller.ts` - Controller files
- `auth.service.ts` - Service files
- `auth.module.ts` - Module files
- `login.dto.ts` - DTO files (kebab-case)
- `user.repository.ts` - Repository files
- `user.schema.ts` - Schema files

## Expected Behavior

When generating code:

1. Follow the existing NestJS module structure in `src/`
2. Use `@common`, `@repositories`, `@utils`, `@config` path aliases for all imports
3. Use `ResponseHandler` for all HTTP responses in controllers
4. Use `UnprocessableEntityException` for business validation errors
5. Apply `@ApiResponse` and `@ApiStandardResponses` to all controller methods
6. Use Drizzle ORM for database operations via repositories
7. Inject services via NestJS constructor injection
8. Write minimal but meaningful comments
9. Use `getEnv()` from `@config` to access environment variables - never use `process.env` directly
10. Use `DatatableType`, `PaginationResponse`, `FilterValidationPipe`, and `ApiDatatableQueries` for list endpoints
