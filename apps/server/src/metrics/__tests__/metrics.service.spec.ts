import { Test } from '@nestjs/testing';
import { MetricsService } from '../metrics.service';

describe('MetricsService', () => {
  let service: MetricsService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [MetricsService],
    }).compile();

    service = module.get(MetricsService);
    service.onModuleInit();
  });

  afterEach(() => {
    service.registry.clear();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return metrics in Prometheus format', async () => {
    const metrics = await service.getMetrics();
    expect(metrics).toContain('# HELP');
    expect(metrics).toContain('# TYPE');
  });

  it('should return correct content type', () => {
    const contentType = service.getContentType();
    expect(contentType).toContain('text/plain');
  });

  it('should track HTTP request duration', async () => {
    service.httpRequestDuration
      .labels('GET', '/api/v1/messages', '200')
      .observe(0.123);

    const metrics = await service.getMetrics();
    expect(metrics).toContain('http_request_duration_seconds');
  });

  it('should track HTTP request count', async () => {
    service.httpRequestsTotal
      .labels('GET', '/api/v1/messages', '200')
      .inc();

    const metrics = await service.getMetrics();
    expect(metrics).toContain('http_requests_total');
  });

  it('should track WebSocket connections', async () => {
    service.wsConnectionsActive.labels('/chat').set(42);

    const metrics = await service.getMetrics();
    expect(metrics).toContain('ws_connections_active');
    expect(metrics).toContain('42');
  });

  it('should track messages sent', async () => {
    service.messagesSentTotal.inc();
    service.messagesSentTotal.inc();

    const metrics = await service.getMetrics();
    expect(metrics).toContain('messages_sent_total');
    expect(metrics).toContain('2');
  });

  it('should track LLM latency', async () => {
    service.llmLatencySeconds
      .labels('deepseek', 'deepseek-chat')
      .observe(1.5);

    const metrics = await service.getMetrics();
    expect(metrics).toContain('llm_latency_seconds');
  });

  it('should track LLM request count', async () => {
    service.llmRequestsTotal
      .labels('deepseek', 'deepseek-chat', 'success')
      .inc();

    const metrics = await service.getMetrics();
    expect(metrics).toContain('llm_requests_total');
  });

  it('should track uploads', async () => {
    service.uploadsTotal.labels('IMAGE', 'success').inc();

    const metrics = await service.getMetrics();
    expect(metrics).toContain('uploads_total');
  });

  it('should include default Node.js metrics', async () => {
    const metrics = await service.getMetrics();
    expect(metrics).toContain('process_cpu');
    expect(metrics).toContain('nodejs_heap');
  });
});
