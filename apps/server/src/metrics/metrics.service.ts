import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  Registry,
  Counter,
  Gauge,
  Histogram,
  collectDefaultMetrics,
} from 'prom-client';

@Injectable()
export class MetricsService implements OnModuleInit {
  readonly registry = new Registry();

  // HTTP metrics
  readonly httpRequestDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route', 'status_code'] as const,
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [this.registry],
  });

  readonly httpRequestsTotal = new Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status_code'] as const,
    registers: [this.registry],
  });

  // WebSocket metrics
  readonly wsConnectionsActive = new Gauge({
    name: 'ws_connections_active',
    help: 'Number of active WebSocket connections',
    labelNames: ['namespace'] as const,
    registers: [this.registry],
  });

  readonly wsMessagesTotal = new Counter({
    name: 'ws_messages_total',
    help: 'Total WebSocket messages processed',
    labelNames: ['event', 'namespace'] as const,
    registers: [this.registry],
  });

  // Chat metrics
  readonly messagesSentTotal = new Counter({
    name: 'messages_sent_total',
    help: 'Total chat messages sent',
    registers: [this.registry],
  });

  readonly messagesRecalledTotal = new Counter({
    name: 'messages_recalled_total',
    help: 'Total chat messages recalled',
    registers: [this.registry],
  });

  // AI metrics
  readonly llmRequestsTotal = new Counter({
    name: 'llm_requests_total',
    help: 'Total LLM API requests',
    labelNames: ['provider', 'model', 'status'] as const,
    registers: [this.registry],
  });

  readonly llmLatencySeconds = new Histogram({
    name: 'llm_latency_seconds',
    help: 'LLM API call latency in seconds',
    labelNames: ['provider', 'model'] as const,
    buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
    registers: [this.registry],
  });

  // Upload metrics
  readonly uploadsTotal = new Counter({
    name: 'uploads_total',
    help: 'Total file uploads',
    labelNames: ['type', 'status'] as const,
    registers: [this.registry],
  });

  onModuleInit() {
    collectDefaultMetrics({ register: this.registry });
  }

  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  getContentType(): string {
    return this.registry.contentType;
  }
}
