import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { EventsService } from './events.service.js';

const isEmpty = (v: unknown) =>
  v === undefined || v === null || (typeof v === 'object' && Object.keys(v).length === 0);

@Controller('event')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  /**
   * Store any JSON body as an event.
   * Send a JSON array to store a batch: every element becomes its own event.
   */
  @Post()
  create(@Body() body: unknown) {
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
