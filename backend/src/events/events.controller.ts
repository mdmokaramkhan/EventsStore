import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { EventsService } from './events.service.js';

const isEmpty = (v: unknown) =>
  v === undefined || v === null || (typeof v === 'object' && Object.keys(v).length === 0);

const isWrappedBatch = (v: unknown): v is { events: any[]; [k: string]: unknown } =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && Array.isArray((v as any).events);

@Controller('event')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  /**
   * Store any JSON body as an event.
   * Batches become one stored event per item:
   *  - a JSON array: every element is an event
   *  - { ...batchFields, events: [...] }: every item in `events` is an event, with the
   *    other top-level fields (e.g. batch_id, sent_at) copied into each one
   */
  @Post()
  create(@Body() body: unknown) {
    if (isWrappedBatch(body)) {
      const { events, ...batchFields } = body;
      if (events.length === 0) throw new BadRequestException('Batch must contain at least one event');
      const bad = events.findIndex((e) => isEmpty(e) || typeof e !== 'object' || Array.isArray(e));
      if (bad !== -1) throw new BadRequestException(`events[${bad}] must be a non-empty JSON object`);
      return this.events.createMany(events.map((e) => ({ ...batchFields, ...e })));
    }
    if (Array.isArray(body)) {
      const bad = body.findIndex(isEmpty);
      if (body.length === 0) throw new BadRequestException('Batch must contain at least one event');
      if (bad !== -1) throw new BadRequestException(`Batch item at index ${bad} must be non-empty JSON`);
      return this.events.createMany(body);
    }
    if (isEmpty(body)) throw new BadRequestException('Request body must be non-empty JSON');
    return this.events.create(body);
  }

  @Get()
  findAll() {
    return this.events.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.events.findOne(id);
  }

  /** DELETE /event -> clear all. DELETE /event?ids=a,b -> delete those. */
  @Delete()
  @HttpCode(200)
  removeMany(@Query('ids') ids?: string) {
    if (ids === undefined) return this.events.clear();
    return this.events.removeMany(ids.split(',').filter(Boolean));
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.events.remove(id);
  }
}
