import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';

export interface StoredEvent {
  id: string;
  createdAt: string;
  body: unknown;
}

const DATA_FILE = process.env.EVENTS_FILE ?? join(process.cwd(), 'data', 'events.json');

@Injectable()
export class EventsService implements OnModuleInit {
  private events: StoredEvent[] = [];
  // Serializes writes so concurrent requests can't corrupt the file.
  private writeQueue: Promise<void> = Promise.resolve();

  async onModuleInit() {
    await fs.mkdir(dirname(DATA_FILE), { recursive: true });
    try {
      this.events = JSON.parse(await fs.readFile(DATA_FILE, 'utf8'));
    } catch (err: any) {
      if (err.code !== 'ENOENT') throw err;
      await this.persist();
    }
  }

  findAll(): StoredEvent[] {
    return [...this.events].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  findOne(id: string): StoredEvent {
    const event = this.events.find((e) => e.id === id);
    if (!event) throw new NotFoundException(`Event ${id} not found`);
    return event;
  }

  async create(body: unknown): Promise<StoredEvent> {
    const event: StoredEvent = { id: randomUUID(), createdAt: new Date().toISOString(), body };
    this.events.push(event);
    await this.persist();
    return event;
  }

  /** Stores several events with a single file write. */
  async createMany(bodies: unknown[]): Promise<StoredEvent[]> {
    const created = bodies.map((body) => ({ id: randomUUID(), createdAt: new Date().toISOString(), body }));
    this.events.push(...created);
    await this.persist();
    return created;
  }

  async remove(id: string): Promise<StoredEvent> {
    const event = this.findOne(id);
    this.events = this.events.filter((e) => e.id !== id);
    await this.persist();
    return event;
  }

  async removeMany(ids: string[]): Promise<{ deleted: number }> {
    const set = new Set(ids);
    const before = this.events.length;
    this.events = this.events.filter((e) => !set.has(e.id));
    await this.persist();
    return { deleted: before - this.events.length };
  }

  async clear(): Promise<{ deleted: number }> {
    const deleted = this.events.length;
    this.events = [];
    await this.persist();
    return { deleted };
  }

  private persist(): Promise<void> {
    const snapshot = JSON.stringify(this.events, null, 2);
    this.writeQueue = this.writeQueue.then(async () => {
      const tmp = `${DATA_FILE}.tmp`;
      await fs.writeFile(tmp, snapshot);
      await fs.rename(tmp, DATA_FILE);
    });
    return this.writeQueue;
  }
}
