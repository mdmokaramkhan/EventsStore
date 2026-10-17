# EventsStore

NestJS backend (port 4000) stores events in `backend/data/events.json`; Next.js + shadcn frontend (port 4002) shows them.

```
npm run install:all   # once
npm run dev           # runs both
```

## API
| Method | Path | |
|---|---|---|
| POST | `/event` | store any JSON body → `{ id, createdAt, body }`. Batches are split into one stored event per item and an array is returned: send a JSON array, or `{ "batch_id": "...", "events": [...] }` (the other top-level fields are copied into every item) |
| GET | `/event` | list all (newest first) |
| GET | `/event/:id` | one event |
| DELETE | `/event/:id` | delete one |
| DELETE | `/event?ids=a,b` | delete several |
| DELETE | `/event` | clear all |
