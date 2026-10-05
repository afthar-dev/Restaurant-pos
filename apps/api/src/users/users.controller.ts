import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import {
  createUserSchema,
  updateUserSchema,
  type CreateUserRequest,
  type UpdateUserRequest,
} from '@rpos/shared';
import { RequirePermissions } from '../auth/decorators';
import { CurrentUser, type AuthUser } from '../common/request-context';
import { ZodBody } from '../common/zod-body.pipe';
import { UsersService } from './users.service';

@Controller('users')
@RequirePermissions('users.manage')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.users.list(user.outletId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodBody(createUserSchema)) body: CreateUserRequest,
  ) {
    return this.users.create(user, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBody(updateUserSchema)) body: UpdateUserRequest,
  ) {
    return this.users.update(user, id, body);
  }

  @Post(':id/archive')
  archive(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.users.archive(user, id);
  }

  @Post(':id/restore')
  restore(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.users.restore(user, id);
  }
}
