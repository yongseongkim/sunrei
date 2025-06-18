import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const now = Date.now();

    console.log(`Incoming Request: ${request.method} ${request.url}`);

    return next
      .handle()
      .pipe(
        tap(() => console.log(`Outgoing Response: ${response.statusCode} - ${Date.now() - now}ms`)),
      );
  }
}