import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { MetricsService } from '../../metrics/metrics.service';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  constructor(private readonly metricsService: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();
    const { method, url } = request;
    const startTime = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const response = context.switchToHttp().getResponse();
          const statusCode = response.statusCode;
          const duration = (Date.now() - startTime) / 1000;

          // Record metrics
          const route = this.normalizeRoute(url);
          this.metricsService.httpRequestDuration
            .labels(method, route, String(statusCode))
            .observe(duration);
          this.metricsService.httpRequestsTotal
            .labels(method, route, String(statusCode))
            .inc();

          // Log slow requests (> 1s)
          if (duration > 1) {
            this.logger.warn(
              `${method} ${url} ${statusCode} ${(duration * 1000).toFixed(0)}ms [SLOW]`,
            );
          }
        },
        error: (error) => {
          const duration = (Date.now() - startTime) / 1000;
          const statusCode = error.status || 500;
          const route = this.normalizeRoute(url);

          this.metricsService.httpRequestDuration
            .labels(method, route, String(statusCode))
            .observe(duration);
          this.metricsService.httpRequestsTotal
            .labels(method, route, String(statusCode))
            .inc();
        },
      }),
    );
  }

  /** Normalize URL to route pattern for metric labels (prevent high cardinality) */
  private normalizeRoute(url: string): string {
    return url
      .split('?')[0]
      .replace(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
        ':id',
      )
      .replace(/\/\d+/g, '/:num');
  }
}
