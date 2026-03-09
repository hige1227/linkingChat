import { LoggingInterceptor } from '../logging.interceptor';
import { MetricsService } from '../../../metrics/metrics.service';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of, throwError } from 'rxjs';

describe('LoggingInterceptor', () => {
  let interceptor: LoggingInterceptor;
  let metricsService: MetricsService;

  const mockObserve = jest.fn();
  const mockInc = jest.fn();
  const mockLabels = jest.fn(() => ({ observe: mockObserve, inc: mockInc }));

  beforeEach(() => {
    metricsService = {
      httpRequestDuration: { labels: mockLabels },
      httpRequestsTotal: { labels: mockLabels },
    } as any;

    interceptor = new LoggingInterceptor(metricsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function createMockContext(
    type: string = 'http',
    method: string = 'GET',
    url: string = '/api/v1/messages',
    statusCode: number = 200,
  ): ExecutionContext {
    return {
      getType: () => type,
      switchToHttp: () => ({
        getRequest: () => ({ method, url }),
        getResponse: () => ({ statusCode }),
      }),
    } as any;
  }

  it('should be defined', () => {
    expect(interceptor).toBeDefined();
  });

  it('should record metrics on successful request', (done) => {
    const context = createMockContext();
    const next: CallHandler = { handle: () => of({ data: 'test' }) };

    interceptor.intercept(context, next).subscribe({
      complete: () => {
        expect(mockLabels).toHaveBeenCalledWith('GET', '/api/v1/messages', '200');
        expect(mockObserve).toHaveBeenCalled();
        expect(mockInc).toHaveBeenCalled();
        done();
      },
    });
  });

  it('should record metrics on error', (done) => {
    const context = createMockContext('http', 'POST', '/api/v1/auth/login');
    const error = { status: 401, message: 'Unauthorized' };
    const next: CallHandler = { handle: () => throwError(() => error) };

    interceptor.intercept(context, next).subscribe({
      error: () => {
        expect(mockLabels).toHaveBeenCalledWith('POST', '/api/v1/auth/login', '401');
        expect(mockObserve).toHaveBeenCalled();
        expect(mockInc).toHaveBeenCalled();
        done();
      },
    });
  });

  it('should normalize UUIDs in route', (done) => {
    const context = createMockContext(
      'http',
      'GET',
      '/api/v1/messages/550e8400-e29b-41d4-a716-446655440000',
    );
    const next: CallHandler = { handle: () => of({}) };

    interceptor.intercept(context, next).subscribe({
      complete: () => {
        expect(mockLabels).toHaveBeenCalledWith(
          'GET',
          '/api/v1/messages/:id',
          '200',
        );
        done();
      },
    });
  });

  it('should strip query params from route', (done) => {
    const context = createMockContext(
      'http',
      'GET',
      '/api/v1/messages?page=1&limit=20',
    );
    const next: CallHandler = { handle: () => of({}) };

    interceptor.intercept(context, next).subscribe({
      complete: () => {
        expect(mockLabels).toHaveBeenCalledWith('GET', '/api/v1/messages', '200');
        done();
      },
    });
  });

  it('should skip non-HTTP contexts', (done) => {
    const context = createMockContext('ws');
    const next: CallHandler = { handle: () => of({}) };

    interceptor.intercept(context, next).subscribe({
      complete: () => {
        expect(mockLabels).not.toHaveBeenCalled();
        done();
      },
    });
  });
});
